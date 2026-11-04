#pragma once
#import <Foundation/Foundation.h>

// A local immutable note; the app identity is hashed as a directory name, never treated as a path.
NSURL* zn_feedback_save(NSURL* root, NSDictionary* context, NSString* note, NSError** error);
