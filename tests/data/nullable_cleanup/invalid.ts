const opaque: any = 1;
const cleanup: (() => void) | undefined = opaque;
if (cleanup !== undefined) cleanup();
