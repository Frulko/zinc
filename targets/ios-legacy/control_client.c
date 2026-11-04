// Local diagnostic client; SSH is the transport, no network listener is opened.
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <mach/mach.h>
#include <mach/arm/thread_status.h>
#include <mach-o/dyld_images.h>

static int sample(int pid) {
  task_t task;
  kern_return_t error = task_for_pid(mach_task_self(), pid, &task);
  if (error) { fprintf(stderr, "task_for_pid: %d\n", error); return 1; }
  struct task_basic_info memory = {0};
  mach_msg_type_number_t size = TASK_BASIC_INFO_COUNT;
  task_info(task, TASK_BASIC_INFO, (task_info_t)&memory, &size);
  unsigned long load = 0;
  struct task_dyld_info dyld = {0}; size = TASK_DYLD_INFO_COUNT;
  if (!task_info(task, TASK_DYLD_INFO, (task_info_t)&dyld, &size)) {
    struct dyld_all_image_infos images; vm_size_t copied;
    if (!vm_read_overwrite(task, dyld.all_image_info_addr, sizeof images, (vm_address_t)&images, &copied)) {
      struct dyld_image_info first;
      if (images.infoArrayCount && !vm_read_overwrite(task, (vm_address_t)images.infoArray, sizeof first, (vm_address_t)&first, &copied))
        load = (unsigned long)first.imageLoadAddress;
    }
  }
  thread_act_array_t threads; mach_msg_type_number_t count;
  if (task_threads(task, &threads, &count)) { mach_port_deallocate(mach_task_self(), task); return 1; }
  printf("{\"pid\":%d,\"rssBytes\":%llu,\"load\":%lu,\"threads\":[", pid, (unsigned long long)memory.resident_size, load);
  for (unsigned i = 0; i < count; ++i) {
    struct thread_basic_info info = {0}; arm_thread_state_t state = {0};
    size = THREAD_BASIC_INFO_COUNT;
    thread_info(threads[i], THREAD_BASIC_INFO, (thread_info_t)&info, &size);
    size = ARM_THREAD_STATE_COUNT;
    thread_get_state(threads[i], ARM_THREAD_STATE, (thread_state_t)&state, &size);
    printf("%s{\"cpuPercent\":%.2f,\"state\":%d,\"pc\":%u,\"lr\":%u,\"sp\":%u}", i ? "," : "", info.cpu_usage * 100.0 / TH_USAGE_SCALE, info.run_state, state.__pc, state.__lr, state.__sp);
    mach_port_deallocate(mach_task_self(), threads[i]);
  }
  puts("]}");
  vm_deallocate(mach_task_self(), (vm_address_t)threads, count * sizeof *threads);
  mach_port_deallocate(mach_task_self(), task);
  return 0;
}

int main(int argc, char** argv) {
  if (argc < 2) return 2;
  if (!strcmp(argv[1], "sample")) {
    char* end = NULL;
    long pid = argc == 3 ? strtol(argv[2], &end, 10) : 0;
    return pid > 0 && end && !*end ? sample((int)pid) : 2;
  }
  char message[1024] = {0};
  size_t length = 0;
  for (int i = 1; i < argc; ++i) {
    size_t n = strlen(argv[i]);
    if (length + n + 1 >= sizeof message) return 2;
    if (length) message[length++] = ' ';
    memcpy(message + length, argv[i], n); length += n;
  }
  const char* output = !strcmp(message, "shot") ? "/var/mobile/Library/Zinc/control.png" :
                       !strcmp(message, "info") ? "/var/mobile/Library/Zinc/info.json" :
                       !strcmp(message, "keyboard-state") ? "/var/mobile/Library/Zinc/keyboard.json" : NULL;
  if (output) unlink(output);
  int fd = socket(AF_UNIX, SOCK_DGRAM, 0);
  if (fd < 0) { perror("socket"); return 1; }
  struct sockaddr_un address = {0};
  address.sun_len = sizeof address; address.sun_family = AF_UNIX;
  strcpy(address.sun_path, "/var/mobile/Library/Zinc/control.sock");
  if (sendto(fd, message, length, 0, (struct sockaddr*)&address, sizeof address) != (ssize_t)length) {
    perror("Zinc control"); close(fd); return 1;
  }
  close(fd);
  if (!output) return 0;
  for (int tries = 0; tries < 200; ++tries) {
    FILE* file = fopen(output, "rb");
    if (file) {
      char bytes[4096]; size_t n;
      while ((n = fread(bytes, 1, sizeof bytes, file)))
        if (fwrite(bytes, 1, n, stdout) != n) { fclose(file); return 1; }
      int error = ferror(file); fclose(file); return error ? 1 : 0;
    }
    usleep(25000);
  }
  fprintf(stderr, "Zinc did not answer; bring it to the foreground.\n");
  return 1;
}
