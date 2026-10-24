#ifndef _SHACCCG_EXT_H_
#define _SHACCCG_EXT_H_

#include <psp2/types.h>
#include <psp2/shacccg.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SCE_SHACCCG_EXT_VERTEX_SA_REG_LIMIT_128 0
#define SCE_SHACCCG_EXT_VERTEX_SA_REG_LIMIT_256 1
#define SCE_SHACCCG_EXT_VERTEX_SA_REG_LIMIT_512 2

#define SCE_SHACCCG_EXT_VERTEX_SA_REG_LIMIT_DEFAULT SCE_SHACCCG_EXT_VERTEX_SA_REG_LIMIT_128

/**
 * @brief Enables extensions through module patches
 * 
 * @return 0 on success, -1 on failure
 */
int sceShaccCgExtEnableExtensions();

/**
 * @brief Release extension patches
 * 
 */
void sceShaccCgExtDisableExtensions();

/**
 * @brief Set the internal source file
 * 
 * The internal source file functions as a special include file. It has special priviledges
 * that allows for the declaration of intrinsics using '__attribute__'.
 * 
 * @param[in] sourceFile - The file to use as internal source code.
 * 
 * @note The sourceFile is not copied by this function.
 */
void sceShaccCgExtSetInternalSourceFile(const SceShaccCgSourceFile *sourceFile);

/**
 * @brief Set the limit on vertex program SA register count
 *
 * By default the limit is 128 SA registers, but the hardware can support up to 512 SA registers for the vertex program.
 *
 * @param limit - One of SCE_SHACCCG_EXT_VERTEX_SA_REG_LIMIT_(128/256/512)
 * @return 0 on success, -1 on failure
 */
int sceShaccCgExtSetVertexSecondaryLimit(SceUInt limit);

#ifdef __cplusplus
}
#endif

#endif /* _SHACCCG_EXT_H_ */