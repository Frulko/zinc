#import "ios_feedback_store.h"
#import <CommonCrypto/CommonDigest.h>

NSURL* zn_feedback_save(NSURL* root, NSDictionary* context, NSString* note, NSError** error) {
  NSString* text = [note stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  NSString* app = context[@"app"];
  if (text.length == 0 || ![app isKindOfClass:NSString.class] || app.length == 0) {
    if (error) *error = [NSError errorWithDomain:@"ZincFeedback" code:1 userInfo:@{NSLocalizedDescriptionKey: @"La note et l’application sont obligatoires."}];
    return nil;
  }
  NSData* identity = [app dataUsingEncoding:NSUTF8StringEncoding];
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(identity.bytes, (CC_LONG)identity.length, digest);
  NSMutableString* key = [NSMutableString string];
  for (unsigned char byte : digest) [key appendFormat:@"%02x", byte];
  NSURL* folder = [[root URLByAppendingPathComponent:@"feedback" isDirectory:YES] URLByAppendingPathComponent:key isDirectory:YES];
  if (![NSFileManager.defaultManager createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:error]) return nil;
  NSMutableDictionary* entry = [context mutableCopy];
  NSString* identifier = NSUUID.UUID.UUIDString;
  entry[@"schema"] = @1;
  entry[@"id"] = identifier;
  entry[@"note"] = text;
  entry[@"timestamp"] = [[NSISO8601DateFormatter new] stringFromDate:NSDate.date];
  NSData* data = [NSJSONSerialization dataWithJSONObject:entry options:NSJSONWritingPrettyPrinted error:error];
  if (!data) return nil;
  NSURL* file = [folder URLByAppendingPathComponent:[identifier stringByAppendingString:@".json"]];
  return [data writeToURL:file options:NSDataWritingAtomic error:error] ? file : nil;
}
