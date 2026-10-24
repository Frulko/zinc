#include "shacccg_ext.h"

#include <stdbool.h>
#include <stdlib.h>
#include <taihen.h>

#include <psp2/kernel/modulemgr.h>
#include <psp2/kernel/clib.h>

#include "sce_intrinsics.h"

#ifdef NDEBUG
#define LOG(level, msg, args...)
#else
#define LOG(level, msg, args...) sceClibPrintf("[SceShaccCgExt  ] - %s:%d:"#level":"msg"\n", __func__, __LINE__, ##args);
#endif

#define ENCODE_MOV_IMM(inst0, inst1, imm)                              \
	inst0 |= ((((imm & 0x800) >> 11) << 10) | ((imm & 0xF000) >> 12)); \
	inst1 |= ((imm & 0xFF) | (((imm & 0x700) >> 8) << 12))

#define FUNCTION_PTR(functionPointer, segmentBase, offset, thumb) functionPointer = (typeof(functionPointer))(((uintptr_t)segmentBase + offset) | thumb)

static const char *cgStdLib;
static const SceShaccCgSourceFile *internalSourceFile;
static bool (*LoadInternalString)(void *, const char *); // FUN_812011ec

static SceUID moduleId = -1;
static SceUID injectIds[7] = {-1, -1, -1, -1, -1, -1, -1}; // Inject 6 is for the secondary limit patch
static SceUID hookId = -1;
static SceUInt vertexSaRegLimit = SCE_SHACCCG_EXT_VERTEX_SA_REG_LIMIT_DEFAULT; 

static tai_hook_ref_t hookRef;

static int ProcessPragma_patch(void *this, int pragmaCode);
static void GetPragmaFunctionPointers(void *segment0);

static bool LoadInternalString_patch(void *param_1, bool nostdlib)
{
	if (!LoadInternalString(param_1, sce_intrinsics))
		return false;

	if (!nostdlib && !LoadInternalString(param_1, cgStdLib))
		return false;

	if (internalSourceFile != NULL && !LoadInternalString(param_1, internalSourceFile->text))
		return false;

	return true;
}

static void *FUN_811fe7a4_patch(uint32_t param_1, uint32_t param_2, uint32_t param_3, uint32_t param_4, uint32_t param_5, uint32_t param_6, uint32_t param_7, uint32_t param_8)
{
	*(uint8_t *)(param_3 + 0xb) = *(*(uint8_t **)(param_1 + 0x90) + 0x3a); // pedanticError
	*(uint8_t *)(param_7 + 0x14) = 1;									   // Extension support

	return TAI_CONTINUE(void *, hookRef, param_1, param_2, param_3, param_4, param_5, param_6, param_7, param_8);
}

void sceShaccCgExtSetInternalSourceFile(const SceShaccCgSourceFile *sourceFile)
{
	internalSourceFile = sourceFile;
}

int sceShaccCgExtEnableExtensions()
{
	tai_module_info_t taiModuleInfo = {0};
	SceKernelModuleInfo moduleInfo = {0};
	moduleInfo.size = sizeof(moduleInfo);
	taiModuleInfo.size = sizeof(taiModuleInfo);

	if (taiGetModuleInfo("SceShaccCg", &taiModuleInfo) < 0)
	{
		LOG(ERROR, "SceShaccCg module is not loaded");
		goto fail;
	}

	if (taiModuleInfo.module_nid != 0xEE15880D && taiModuleInfo.module_nid != 0x6C3C7547)
	{
		LOG(ERROR, "SceShaccCg module NID is not as expected");
		goto fail;
	}

	moduleId = taiModuleInfo.modid;

	// Patch stdlib load. Allows for loading custom internal source code.
	uint16_t internalSourcePatch[] =
		{
			0xF240, 0x0200, // movw r2, #0x...
			0xF2C0, 0x0200, // movt r2, #0x...
			0x4620,			// mov r0, r4
			0x4790,			// blx r2
			0xBF00			// nop
		};
	// Patch pragma handling. Allows for custom implementation of pragmas.
	uint16_t pragmaPatch[] =
		{
			0xF240, 0x0200, // movw r2, #0x...
			0xF2C0, 0x0200, // movt r2, #0x...
			0x4601,			// mov r1, r0
			0x4620,			// mov r0, r4
			0x4790,			// blx r2
			0x2800,			// cmp r0, #0x0
			0xD108,			// bne 0x24
			0xE043			// b 0x9c
		};
	// Patch to pass nostdlib value to LoadInternalString_patch
	uint16_t nostdlibPatch[] =
		{
			0x4619, // mov r1, r3
			0xE7E5, // b -#0x50

			0x4619,		   // mov r1, r3
			0xF000, 0xB8B0 // b.w #0x164
		};

	uint16_t moduleUnloadPatch[] = 
	{
		0xF240, 0x0300, // movw r3, #0x...
		0xF2C0, 0x0300, // movt r3, #0x...
		0x4718          // bx r3
	};

	ENCODE_MOV_IMM(internalSourcePatch[0], internalSourcePatch[1], (uint32_t)(LoadInternalString_patch)&0xFFFF);
	ENCODE_MOV_IMM(internalSourcePatch[2], internalSourcePatch[3], (uint32_t)(LoadInternalString_patch) >> 16);
	ENCODE_MOV_IMM(pragmaPatch[0], pragmaPatch[1], (uint32_t)(ProcessPragma_patch)&0xFFFF);
	ENCODE_MOV_IMM(pragmaPatch[2], pragmaPatch[3], (uint32_t)(ProcessPragma_patch) >> 16);
	ENCODE_MOV_IMM(moduleUnloadPatch[0], moduleUnloadPatch[1], (uint32_t)(sceShaccCgExtDisableExtensions)&0xFFFF);
	ENCODE_MOV_IMM(moduleUnloadPatch[2], moduleUnloadPatch[3], (uint32_t)(sceShaccCgExtDisableExtensions) >> 16);

	if (sceKernelGetModuleInfo(moduleId, &moduleInfo) < 0)
		goto fail;

	cgStdLib = (char *)(moduleInfo.segments[0].vaddr + 0x29A778);
	FUNCTION_PTR(LoadInternalString, moduleInfo.segments[0].vaddr, 0x2011EC, 1);

	GetPragmaFunctionPointers(moduleInfo.segments[0].vaddr);

	injectIds[0] = taiInjectData(moduleId, 0, 0x201D02, &internalSourcePatch[0], sizeof(internalSourcePatch));
	if (injectIds[0] < 0)
		goto fail;
	injectIds[1] = taiInjectData(moduleId, 0, 0x30D56, &pragmaPatch[0], sizeof(pragmaPatch));
	if (injectIds[1] < 0)
		goto fail;
	injectIds[2] = taiInjectData(moduleId, 0, 0x201D32, &nostdlibPatch[0], sizeof(uint16_t) * 2);
	if (injectIds[2] < 0)
		goto fail;
	injectIds[3] = taiInjectData(moduleId, 0, 0x201B9C, &nostdlibPatch[2], sizeof(uint16_t) * 3);
	if (injectIds[3] < 0)
		goto fail;
	injectIds[4] = taiInjectData(moduleId, 0, 0x204242, &moduleUnloadPatch[0], sizeof(moduleUnloadPatch));
	if (injectIds[4] < 0)
		goto fail;
	injectIds[5] = taiInjectData(moduleId, 0, 0x20425A, &moduleUnloadPatch[0], sizeof(moduleUnloadPatch));
	if (injectIds[5] < 0)
		goto fail;

	hookId = taiHookFunctionOffset(&hookRef, moduleId, 0, 0x1FE7A4, 1, FUN_811fe7a4_patch);
	if (hookId < 0)
		goto fail;

	return 0;
fail:
	LOG(ERROR, "Failed to apply patches");
	sceShaccCgExtDisableExtensions();
	return -1;
}

void sceShaccCgExtDisableExtensions()
{
	if (hookId > 0)
		taiHookRelease(hookId, hookRef);
	if (injectIds[6] > 0)
		taiInjectRelease(injectIds[6]);
	if (injectIds[5] > 0)
		taiInjectRelease(injectIds[5]);
	if (injectIds[4] > 0)
		taiInjectRelease(injectIds[4]);
	if (injectIds[3] > 0)
		taiInjectRelease(injectIds[3]);
	if (injectIds[2] > 0)
		taiInjectRelease(injectIds[2]);
	if (injectIds[1] > 0)
		taiInjectRelease(injectIds[1]);
	if (injectIds[0] > 0)
		taiInjectRelease(injectIds[0]);

	sceClibMemset(&injectIds[0], -1, sizeof(injectIds));
	hookId = -1;
	moduleId = -1;
}

int sceShaccCgExtSetVertexSecondaryLimit(SceUInt limit)
{
	if (limit > SCE_SHACCCG_EXT_VERTEX_SA_REG_LIMIT_512)
	{
		LOG(ERROR, "Invalid limit");
		return -1;
	}
	
	if (moduleId == -1)
	{
		LOG(ERROR, "Extensions are not been enabled");
		return -1;
	}

	if (injectIds[6] != -1 && vertexSaRegLimit != limit) // If a patch has been applied before, release it
	{
		taiInjectRelease(injectIds[6]);
		injectIds[6] = -1;
	}

	if ((limit == SCE_SHACCCG_EXT_VERTEX_SA_REG_LIMIT_DEFAULT) || (vertexSaRegLimit == limit)) // No patch is necessary
		goto exit;

	uint16_t saRegLimitPatch[3] =
		{
			0x2080, // mov r0, #0x80     This is the default in ShaccCg
			/**
			 * Can't encode more than 8-bits in a 16-bit mov instruction
			 * r2 has a value of 1 at this point, so we'll do a logical shift to get the value we want.
			 */
			0x0210, // lsl r0, r2, #0x8
			0x0250	// lsl r0, r2, #0x9
		};

	injectIds[6] = taiInjectData(moduleId, 0, 0x127a80, &saRegLimitPatch[limit], sizeof(uint16_t));
	if (injectIds[6] < 0)
	{
		LOG(ERROR, "Failed to apply patch for secondary limit");
		return -1;
	}

exit:
	vertexSaRegLimit = limit;
	return 0;
}

/******************************************************************
 *                        Pragma handling                         *
 ******************************************************************/

typedef struct
{
	uint32_t line;
	uint32_t column;
	char *string;
	uint32_t stringLength;
	uint16_t token;
	uint16_t unk_0x12;
} PPInput;

typedef struct
{
	uint32_t storage;
	uint32_t readwrite;
	uint32_t strip;
	uint32_t symbols;
} BufferInfo;

typedef struct
{
	uint8_t data[8];
} ErrorData;

enum PPPragmas
{
	REGISTER_BUFFER,
	MEMORY_BUFFER,
	RW_BUFFER,
	STRIP_BUFFER,
	WARNING,
	LOOP,
	BRANCH,
	ARGUMENT,
	DIAGNOSTIC,
	PACK_MATRIX,
	INVPOS,
	DISABLE_FEATURE,
	DISABLE_BUFFER_SYMS,
	ENABLE_BUFFER_SYMS,
	PSSL_TARGET_OUTPUT_FORMAT,
	DISABLE_BANK_CLASH_ADJ
};

static void (*ProcessPragma_PositionInvariant)(void *);
static void (*ProcessPragma_DisableFeature)(void *);
static void (*ProcessPragma_Skip)(void *);

static char *(*GetPragmaString)(int pragmaCode);
static char *(*GetTokenString)(int tokenCode);
static void (*PPNext)(void *);
static void (*PPGetCurrent)(PPInput *input, void *);
static void (*PPSubmitError)(void *, void *, PPInput *, int);
static void (*PPErrorAddArg)(void *, char *);
static void (*PPErrorFinish)(void *);
static void (*PPFatalError)(int);

static void (*FUN_81017434)(void *, char *, char *, int, void *, void *, void *, int, int);
static void (*FUN_81016160)(void *, char *, char *, int, int, void *);
static int (*FUN_8101f554)(PPInput *, char **, void *);
static int (*FUN_810163b8)(void *, void *);

static int (*FUN_81003b6c)(void *, uint32_t);
static void (*FUN_81216ccc)(void **, void *);
static void *(*FUN_812012f0)(void *, void *, uint32_t *);
static int (*FUN_812015f4)(void **);
static void *(*FUN_81215b1c)(void *, uint32_t);

static void *(*FUN_81009884)();
static void *(*_HeapAlloc)(void *, size_t);
static void (*_HeapFree)(void *);

void (*_AtomicIncrement)(uint32_t *);
uint32_t (*_AtomicDecrement)(uint32_t *);

static void GetPragmaFunctionPointers(void *segment0)
{
	FUNCTION_PTR(ProcessPragma_PositionInvariant, segment0, 0x30918, 1);
	FUNCTION_PTR(ProcessPragma_DisableFeature, segment0, 0x30404, 1);
	FUNCTION_PTR(ProcessPragma_Skip, segment0, 0x2FFC4, 1);

	FUNCTION_PTR(GetPragmaString, segment0, 0x18EA4, 1);
	FUNCTION_PTR(GetTokenString, segment0, 0x1F464, 1);
	FUNCTION_PTR(PPNext, segment0, 0x2FF64, 1);
	FUNCTION_PTR(PPGetCurrent, segment0, 0x2FF1C, 1);
	FUNCTION_PTR(PPSubmitError, segment0, 0x300FC, 1);
	FUNCTION_PTR(PPErrorAddArg, segment0, 0x4264, 1);
	FUNCTION_PTR(PPErrorFinish, segment0, 0x47EC, 1);
	FUNCTION_PTR(PPFatalError, segment0, 0x6138, 1);

	FUNCTION_PTR(FUN_81016160, segment0, 0x16160, 1);
	FUNCTION_PTR(FUN_8101f554, segment0, 0x1F554, 1);
	FUNCTION_PTR(FUN_810163b8, segment0, 0x163B8, 1);
	FUNCTION_PTR(FUN_81017434, segment0, 0x17434, 1);

	FUNCTION_PTR(FUN_81003b6c, segment0, 0x3B6C, 1);
	FUNCTION_PTR(FUN_81216ccc, segment0, 0x216CCC, 1);
	FUNCTION_PTR(FUN_812012f0, segment0, 0x2012F0, 1);
	FUNCTION_PTR(FUN_812015f4, segment0, 0x2015F4, 1);
	FUNCTION_PTR(FUN_81215b1c, segment0, 0x215B1C, 1);

	FUNCTION_PTR(FUN_81009884, segment0, 0x9884, 1);
	FUNCTION_PTR(_HeapAlloc, segment0, 0x98B0, 1);
	FUNCTION_PTR(_HeapFree, segment0, 0x98D0, 1);

	FUNCTION_PTR(_AtomicIncrement, segment0, 0x1D34, 1);
	FUNCTION_PTR(_AtomicDecrement, segment0, 0x1D48, 1);
}

void *_sceShaccCgHeapAlloc(size_t size)
{
	return _HeapAlloc(FUN_81009884(), size);
}
void _sceShaccCgHeapFree(void *ptr)
{
	_HeapFree(ptr);
}

static inline bool PPIsValidForString(PPInput *input)
{
	if (input->token == 6 || input->token == 0x3D || input->token >= 0x40 || input->string != NULL)
		return true;
	else
		return false;
}
static inline char *PPGetString(PPInput *input)
{
	if (!PPIsValidForString(input))
		PPFatalError(1);

	return input->string + 0xc;
}

static void RogueTokensError(void *this, int pragmaCode)
{
	PPInput input;
	uint8_t errorData[8];

	PPGetCurrent(&input, this);
	PPSubmitError(errorData, this, &input, 0x800062);
	PPErrorAddArg(errorData, GetPragmaString(pragmaCode));
	PPErrorFinish(errorData);
}
static void ExpectedXError(void *this, int expectedTokenCode)
{
	PPInput input;
	uint8_t errorData[8];

	PPGetCurrent(&input, this);
	PPSubmitError(errorData, this, &input, 0x8000AC);
	PPErrorAddArg(errorData, GetTokenString(expectedTokenCode));
	PPErrorAddArg(errorData, GetTokenString(input.token));
	PPErrorFinish(errorData);
}
static void ExpectedXOrYError(void *this, int expectedTokenCode0, int expectedTokenCode1)
{
	PPInput input;
	uint8_t errorData[8];

	PPGetCurrent(&input, this);
	PPSubmitError(errorData, this, &input, 0x8000AD);
	PPErrorAddArg(errorData, GetTokenString(expectedTokenCode0));
	PPErrorAddArg(errorData, GetTokenString(expectedTokenCode1));

	if (PPIsValidForString(&input))
		PPErrorAddArg(errorData, PPGetString(&input));
	else
		PPErrorAddArg(errorData, GetTokenString(input.token));

	PPErrorFinish(errorData);
}
static void NoParamError(void *this, int errorCode)
{
	PPInput input;
	uint8_t errorData[8];

	PPGetCurrent(&input, this);
	PPSubmitError(errorData, this, &input, errorCode);
	PPErrorFinish(errorData);
}
static void SingleParamError(void *this, int errorCode, char *param)
{
	PPInput input;
	uint8_t errorData[8];

	PPGetCurrent(&input, this);
	PPSubmitError(errorData, this, &input, errorCode);
	PPErrorAddArg(errorData, param);
	PPErrorFinish(errorData);
}

static void ProcessPragma_BufferStorage(void *this, int storage);
static void ProcessPragma_ReadWriteBuffer(void *this);
static void ProcessPragma_StripBuffer(void *this);
static void ProcessPragma_Warning(void *this);
static void ProcessPragma_Loop(void *this);
static void ProcessPragma_Branch(void *this);
static void ProcessPragma_Argument(void *this);
static void ProcessPragma_Diag(void *this);
static void ProcessPragma_PackMatrix(void *this);
static void ProcessPragma_BufferSymbols(void *this, int symbols);
static void ProcessPragma_DisableBankClashAdjustment(void *this);

static int ProcessPragma_patch(void *this, int pragmaCode)
{
	switch (pragmaCode)
	{
	case REGISTER_BUFFER:
		ProcessPragma_BufferStorage(this, 1);
		break;
	case MEMORY_BUFFER:
		ProcessPragma_BufferStorage(this, 2);
		break;
	case RW_BUFFER:
		ProcessPragma_ReadWriteBuffer(this);
		break;
	case STRIP_BUFFER:
		ProcessPragma_StripBuffer(this);
		break;
	case WARNING:
		ProcessPragma_Warning(this);
		break;
	case LOOP:
		ProcessPragma_Loop(this);
		break;
	case BRANCH:
		ProcessPragma_Branch(this);
		break;
	case ARGUMENT:
		ProcessPragma_Argument(this);
		break;
	case DIAGNOSTIC:
		ProcessPragma_Diag(this);
		break;
	case PACK_MATRIX:
		ProcessPragma_PackMatrix(this);
		break;
	case INVPOS:
		ProcessPragma_PositionInvariant(this);
		break;
	case DISABLE_FEATURE:
		ProcessPragma_DisableFeature(this);
		break;
	case DISABLE_BUFFER_SYMS:
		ProcessPragma_BufferSymbols(this, 2);
		break;
	case ENABLE_BUFFER_SYMS:
		ProcessPragma_BufferSymbols(this, 1);
		break;
	case DISABLE_BANK_CLASH_ADJ:
		ProcessPragma_DisableBankClashAdjustment(this);
		break;
	default: // Unrecognized pragma
		return 0;
		break;
	}

	return 1;
}

static void ProcessPragma_Loop(void *this)
{
	PPInput currentInput;
	char *string;
	void (*_SetUnrollPolicy)(void *, int) = (typeof(_SetUnrollPolicy))*(void **)(**(uintptr_t **)(this + 0xc) + 0x8);

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 0x32) // '('
	{
		ExpectedXError(this, 0x32);
		ProcessPragma_Skip(this);
		return;
	}

	do
	{
		PPNext(this);
		PPGetCurrent(&currentInput, this);

		if (currentInput.token == 0x37) // ';'
			continue;

		if (!PPIsValidForString(&currentInput))
		{
			ExpectedXError(this, 6);
			ProcessPragma_Skip(this);
			return;
		}

		string = PPGetString(&currentInput);

		if (sceClibStrcmp(string, "unroll") != 0)
		{
			SingleParamError(this, 0x800067, string);
			ProcessPragma_Skip(this);
			return;
		}

		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (currentInput.token != 0x2F)
		{
			ExpectedXError(this, 0x2F);
			ProcessPragma_Skip(this);
			return;
		}

		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (!PPIsValidForString(&currentInput))
		{
			ExpectedXError(this, 6);
			ProcessPragma_Skip(this);
			return;
		}

		string = PPGetString(&currentInput);
		if (sceClibStrcmp(string, "always") == 0)
		{
			_SetUnrollPolicy(*(void **)(this + 0xc), 0);
		}
		else if (sceClibStrcmp(string, "never") == 0)
		{
		_SetUnrollPolicy(*(void **)(this + 0xc), 1);
		}
		else if (sceClibStrcmp(string, "default") == 0)
		{
			_SetUnrollPolicy(*(void **)(this + 0xc), 2);
		}
		else
		{
			SingleParamError(this, 0x800068, string);
			ProcessPragma_Skip(this);
			return;
		}


		PPNext(this);
		PPGetCurrent(&currentInput, this);
	} while (currentInput.token == 0x37); // ';'

	if (currentInput.token != 0x33) // ')'
	{
		ExpectedXError(this, 0x33);
		ProcessPragma_Skip(this);
		return;
	}

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 3 && currentInput.token != 1)
	{
		RogueTokensError(this, LOOP);
		ProcessPragma_Skip(this);
		return;
	}

	if (currentInput.token == 3)
	{
		PPNext(this);
	}
}
static void ProcessPragma_Branch(void *this)
{
	PPInput currentInput;
	char *string;
	void (*_SetFlattenPolicy)(void *, int) = (typeof(_SetFlattenPolicy))*(void **)(**(uintptr_t **)(this + 0xc) + 0xC);

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 0x32) // '('
	{
		ExpectedXError(this, 0x32);
		ProcessPragma_Skip(this);
		return;
	}

	do
	{
		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (currentInput.token == 0x37) // ';'
			continue;

		if (!PPIsValidForString(&currentInput))
		{
			ExpectedXError(this, 6);
			ProcessPragma_Skip(this);
			return;
		}

		string = PPGetString(&currentInput);

		if (sceClibStrcmp(string, "flatten") != 0)
		{
			SingleParamError(this, 0x80006D, string);
			ProcessPragma_Skip(this);
			return;
		}

		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (currentInput.token != 0x2F)
		{
			ExpectedXError(this, 0x2F);
			ProcessPragma_Skip(this);
			return;
		}

		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (!PPIsValidForString(&currentInput))
		{
			ExpectedXError(this, 6);
			ProcessPragma_Skip(this);
			return;
		}

		string = PPGetString(&currentInput);
		if (sceClibStrcmp(string, "always") == 0)
		{
		_SetFlattenPolicy(*(void **)(this + 0xc), 0);
		}
		else if (sceClibStrcmp(string, "never") == 0)
		{
		_SetFlattenPolicy(*(void **)(this + 0xc), 1);
		}
		else if (sceClibStrcmp(string, "default") == 0)
		{
			_SetFlattenPolicy(*(void **)(this + 0xc), 2);
		}
		else
		{
			SingleParamError(this, 0x80006E, string);
			ProcessPragma_Skip(this);
			return;
		}


		PPNext(this);
		PPGetCurrent(&currentInput, this);
	} while (currentInput.token == 0x37); // ';'

	if (currentInput.token != 0x33) // ')'
	{
		ExpectedXError(this, 0x33);
		ProcessPragma_Skip(this);
		return;
	}

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 3 && currentInput.token != 1)
	{
		RogueTokensError(this, BRANCH);
		ProcessPragma_Skip(this);
		return;
	}

	if (currentInput.token == 3)
	{
		PPNext(this);
	}
}
static void ProcessPragma_PackMatrix(void *this)
{
	PPInput currentInput;
	char *string;
	bool colMajor;
	void (*_SetPackMatrix)(void *, bool) = (typeof(_SetPackMatrix))*(void **)(**(uintptr_t **)(this + 0xc) + 0x10);

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 0x32)
	{
		ExpectedXError(this, 0x32);
		ProcessPragma_Skip(this);
		return;
	}

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (!PPIsValidForString(&currentInput))
	{
		ExpectedXOrYError(this, 0x8F, 0x90);
		ProcessPragma_Skip(this);
		return;
	}

	string = PPGetString(&currentInput);

	if (sceClibStrcmp(GetTokenString(0x8F), string) == 0)
	{
		colMajor = true;
	}
	else if (sceClibStrcmp(GetTokenString(0x90), string) == 0)
	{
		colMajor = false;
	}
	else
	{
		ExpectedXOrYError(this, 0x8F, 0x90);
		ProcessPragma_Skip(this);
		return;
	}

	_SetPackMatrix(*(void **)(this + 0xc), colMajor);

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 0x33)
	{
		ExpectedXError(this, 0x33);
		ProcessPragma_Skip(this);
		return;
	}

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 3 && currentInput.token != 1)
	{
		RogueTokensError(this, PACK_MATRIX);
		ProcessPragma_Skip(this);
		return;
	}

	if (currentInput.token == 3)
	{
		PPNext(this);
	}
}
static void ProcessPragma_DisableBankClashAdjustment(void *this)
{
	PPInput currentInput;

	*((uint8_t *)this + 0x71) = 1;

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 3 && currentInput.token != 1)
	{
		RogueTokensError(this, DISABLE_BANK_CLASH_ADJ);
		ProcessPragma_Skip(this);
		return;
	}

	if (currentInput.token == 3)
	{
		PPNext(this);
	}
}

static inline void ProcessPragma_Argument_SetOptLevel(void *this, int optLevel, PPInput *input)
{
	uint8_t errorData[8];
	PPInput dummyInput = {0};

	if ((*(int *)(this + 0x44) != 0) && *(uint8_t *)(this + 0x40) != optLevel)
	{
		PPSubmitError(errorData, this, input, 0x800036);
		PPErrorFinish(errorData);

		dummyInput.line = *(int *)(this + 0x44);
		dummyInput.column = *(int *)(this + 0x48);
		PPSubmitError(errorData, this, &dummyInput, 0x14);
		PPErrorFinish(errorData);
	}

	*(uint8_t *)(this + 0x40) = optLevel;
	*(int *)(this + 0x44) = input->line;
	*(int *)(this + 0x48) = input->column;
}
static inline void ProcessPragma_Argument_SetFastMath(void *this, bool fastMath, PPInput *input)
{
	uint8_t errorData[8];
	PPInput dummyInput = {0};

	if ((*(int *)(this + 0x50) != 0) && *(uint8_t *)(this + 0x4C) != fastMath)
	{
		PPSubmitError(errorData, this, input, 0x800036);
		PPErrorFinish(errorData);

		dummyInput.line = *(int *)(this + 0x50);
		dummyInput.column = *(int *)(this + 0x54);
		PPSubmitError(errorData, this, &dummyInput, 0x14);
		PPErrorFinish(errorData);
	}

	*(uint8_t *)(this + 0x4C) = fastMath;
	*(int *)(this + 0x50) = input->line;
	*(int *)(this + 0x54) = input->column;
}
static inline void ProcessPragma_Argument_SetFastPrecision(void *this, bool fastPrecision, PPInput *input)
{
	uint8_t errorData[8];
	PPInput dummyInput = {0};

	if ((*(int *)(this + 0x5C) != 0) && *(uint8_t *)(this + 0x58) != fastPrecision)
	{
		PPSubmitError(errorData, this, input, 0x800036);
		PPErrorFinish(errorData);

		dummyInput.line = *(int *)(this + 0x5C);
		dummyInput.column = *(int *)(this + 0x60);
		PPSubmitError(errorData, this, &dummyInput, 0x14);
		PPErrorFinish(errorData);
	}

	*(uint8_t *)(this + 0x58) = fastPrecision;
	*(int *)(this + 0x5C) = input->line;
	*(int *)(this + 0x60) = input->column;
}
static inline void ProcessPragma_Argument_SetFastInt(void *this, bool fastInt, PPInput *input)
{
	uint8_t errorData[8];
	PPInput dummyInput = {0};

	if ((*(int *)(this + 0x68) != 0) && *(uint8_t *)(this + 0x64) != fastInt)
	{
		PPSubmitError(errorData, this, input, 0x800036);
		PPErrorFinish(errorData);

		dummyInput.line = *(int *)(this + 0x68);
		dummyInput.column = *(int *)(this + 0x6C);
		PPSubmitError(errorData, this, &dummyInput, 0x14);
		PPErrorFinish(errorData);
	}

	*(uint8_t *)(this + 0x64) = fastInt;
	*(int *)(this + 0x68) = input->line;
	*(int *)(this + 0x6C) = input->column;
}
static void ProcessPragma_Argument(void *this)
{
	PPInput currentInput;
	char *string;

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 0x32) // '('
	{
		ExpectedXError(this, 0x32);
		ProcessPragma_Skip(this);
		return;
	}

	do
	{
		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (currentInput.token == 0x37) // ';'
			continue;

		if (!PPIsValidForString(&currentInput))
		{
			ExpectedXError(this, 6);
			ProcessPragma_Skip(this);
			return;
		}

		string = PPGetString(&currentInput);

		if (sceClibStrcmp(string, "O0") == 0)
		{
			ProcessPragma_Argument_SetOptLevel(this, 0, &currentInput);
		}
		else if (sceClibStrcmp(string, "O1") == 0)
		{
			ProcessPragma_Argument_SetOptLevel(this, 1, &currentInput);
		}
		else if (sceClibStrcmp(string, "O2") == 0)
		{
			ProcessPragma_Argument_SetOptLevel(this, 2, &currentInput);
		}
		else if (sceClibStrcmp(string, "O3") == 0)
		{
			ProcessPragma_Argument_SetOptLevel(this, 3, &currentInput);
		}
		else if (sceClibStrcmp(string, "O4") == 0)
		{
			ProcessPragma_Argument_SetOptLevel(this, 4, &currentInput);
		}
		else if (sceClibStrcmp(string, "fastmath") == 0)
		{
			ProcessPragma_Argument_SetFastMath(this, 1, &currentInput);
		}
		else if (sceClibStrcmp(string, "nofastmath") == 0)
		{
			ProcessPragma_Argument_SetFastMath(this, 0, &currentInput);
		}
		else if (sceClibStrcmp(string, "fastprecision") == 0)
		{
			ProcessPragma_Argument_SetFastPrecision(this, 1, &currentInput);
		}
		else if (sceClibStrcmp(string, "nofastprecision") == 0)
		{
			ProcessPragma_Argument_SetFastPrecision(this, 0, &currentInput);
		}
		else if (sceClibStrcmp(string, "bestprecision") == 0)
		{
			ProcessPragma_Argument_SetFastPrecision(this, 0, &currentInput);
			ProcessPragma_Argument_SetFastMath(this, 0, &currentInput);
		}
		else if (sceClibStrcmp(string, "fastint") == 0)
		{
			ProcessPragma_Argument_SetFastInt(this, 1, &currentInput);
		}
		else if (sceClibStrcmp(string, "nofastint") == 0)
		{
			ProcessPragma_Argument_SetFastInt(this, 0, &currentInput);
		}
		else if (sceClibStrcmp(string, "posinv") == 0)
		{
			*(uint8_t *)(this + 0x70) = 1;
		}
		else
		{
			SingleParamError(this, 0x800069, string);
			ProcessPragma_Skip(this);
			return;
		}

		PPNext(this);
		PPGetCurrent(&currentInput, this);
	} while (currentInput.token == 0x37); // ';'

	if (currentInput.token != 0x33) // ')'
	{
		ExpectedXError(this, 0x33);
		ProcessPragma_Skip(this);
		return;
	}

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 3 && currentInput.token != 1)
	{
		RogueTokensError(this, ARGUMENT);
		ProcessPragma_Skip(this);
		return;
	}

	if (currentInput.token == 3)
	{
		PPNext(this);
	}
}

extern BufferInfo *ProcessPragma_Buffer_GetBufferInfo(void *this, int32_t bufferIndex);
static uint32_t ProcessPragma_Buffer_CheckSemantic(void *this)
{
	PPInput input, semanticInput;
	bool arrayIndex = false;
	char indexBuffer[35] = {0};
	char *indexString = &indexBuffer[0];
	int indexStrlen;
	uint8_t unkData[36];
	uint32_t numericData[3] = {0x20, 0x0, 0x0};
	uint8_t unkData2[24];
	uint8_t errorData[8];

	PPGetCurrent(&semanticInput, this);

	if (semanticInput.token != 6)
	{
		NoParamError(this, 0x800060);
		ProcessPragma_Skip(this);
		return -1;
	}

	PPNext(this);
	PPGetCurrent(&input, this);

	if (input.token == 0x30)
	{
		PPNext(this);
		PPGetCurrent(&input, this);

		if (input.token != 7)
		{
			SingleParamError(this, 0x8000B1, GetTokenString(input.token));
			ProcessPragma_Skip(this);
			return -1;
		}

		indexStrlen = FUN_8101f554(&input, &indexString, *(void **)(*(void **)(this + 0x10) + 0x50));
		FUN_81016160(unkData, indexString, indexString + indexStrlen, input.line, input.column, *(void **)(this + 0x10));

		if (unkData[22] || unkData[21] || unkData[20] || (FUN_810163b8(unkData, numericData) == 0))
		{
			SingleParamError(this, 0x800123, GetTokenString(input.token));
			ProcessPragma_Skip(this);
			return -1;
		}

		PPNext(this);
		PPGetCurrent(&input, this);
		if (input.token != 0x31)
		{
			SingleParamError(this, 0x8000B2, GetTokenString(input.token));
			ProcessPragma_Skip(this);
			return -1;
		}
		PPNext(this);

		arrayIndex = true;
	}

	FUN_81017434(unkData2, PPGetString(&semanticInput), PPGetString(&semanticInput) + semanticInput.stringLength, 2, &semanticInput, *(void **)(this + 0x10), *(void **)(this + 0x4), 0, 0);
	if (unkData2[0] != 0)
	{
		ProcessPragma_Skip(this);
		return -1;
	}

	if (unkData2[1] == 0 || (*(int *)(&unkData2[4]) != 5))
	{
		PPSubmitError(errorData, this, &semanticInput, 0x800061);
		PPErrorAddArg(errorData, "BUFFER");
		PPErrorAddArg(errorData, PPGetString(&semanticInput));
		PPErrorFinish(errorData);

		ProcessPragma_Skip(this);
		return -1;
	}

	if (unkData2[2] && arrayIndex)
	{
		PPSubmitError(errorData, this, &semanticInput, 0x800141);
		PPErrorFinish(errorData);

		ProcessPragma_Skip(this);
		return -1;
	}

	if (arrayIndex)
		return numericData[1];
	else
		return *(uint32_t *)(&unkData2[8]);
}
static void ProcessPragma_BufferStorage(void *this, int storage)
{
	PPInput currentInput;
	BufferInfo *bufferInfo;
	uint32_t bufferIndex;
	int pragmaToken = storage == 1 ? REGISTER_BUFFER : MEMORY_BUFFER;

	PPNext(this);

	bufferIndex = ProcessPragma_Buffer_CheckSemantic(this);
	if (bufferIndex != -1)
	{
		bufferInfo = ProcessPragma_Buffer_GetBufferInfo(this + 0x80, bufferIndex);
		bufferInfo->storage = storage;

		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (currentInput.token != 3 && currentInput.token != 1)
		{
			RogueTokensError(this, pragmaToken);
			ProcessPragma_Skip(this);
			return;
		}

		if (currentInput.token == 3)
		{
			PPNext(this);
		}
	}
}
static void ProcessPragma_ReadWriteBuffer(void *this)
{
	PPInput currentInput;
	BufferInfo *bufferInfo;
	uint32_t bufferIndex;

	PPNext(this);

	bufferIndex = ProcessPragma_Buffer_CheckSemantic(this);
	if (bufferIndex != -1)
	{
		bufferInfo = ProcessPragma_Buffer_GetBufferInfo(this + 0x80, bufferIndex);
		bufferInfo->readwrite = 2;

		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (currentInput.token != 3 && currentInput.token != 1)
		{
			RogueTokensError(this, RW_BUFFER);
			ProcessPragma_Skip(this);
			return;
		}

		if (currentInput.token == 3)
		{
			PPNext(this);
		}
	}
}
static void ProcessPragma_StripBuffer(void *this)
{
	PPInput currentInput;
	BufferInfo *bufferInfo;
	uint32_t bufferIndex;

	PPNext(this);

	bufferIndex = ProcessPragma_Buffer_CheckSemantic(this);
	if (bufferIndex != -1)
	{
		bufferInfo = ProcessPragma_Buffer_GetBufferInfo(this + 0x80, bufferIndex);
		bufferInfo->strip = 1;

		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (currentInput.token != 3 && currentInput.token != 1)
		{
			RogueTokensError(this, STRIP_BUFFER);
			ProcessPragma_Skip(this);
			return;
		}

		if (currentInput.token == 3)
		{
			PPNext(this);
		}
	}
}
static void ProcessPragma_BufferSymbols(void *this, int symbols)
{
	PPInput currentInput;
	BufferInfo *bufferInfo;
	uint32_t bufferIndex;
	int pragmaToken = symbols == 1 ? ENABLE_BUFFER_SYMS : DISABLE_BUFFER_SYMS;

	PPNext(this);

	bufferIndex = ProcessPragma_Buffer_CheckSemantic(this);
	if (bufferIndex != -1)
	{
		bufferInfo = ProcessPragma_Buffer_GetBufferInfo(this + 0x80, bufferIndex);
		bufferInfo->symbols = symbols;

		PPNext(this);
		PPGetCurrent(&currentInput, this);
		if (currentInput.token != 3 && currentInput.token != 1)
		{
			RogueTokensError(this, pragmaToken);
			ProcessPragma_Skip(this);
			return;
		}

		if (currentInput.token == 3)
		{
			PPNext(this);
		}
	}
}

extern void ProcessPragma_Warning_PushWarningState(uint8_t *object);
extern bool ProcessPragma_Warning_PopWarningState(uint8_t *object);
extern void ProcessPragma_Warning_ResetWarningContainer(void *this);
extern void ProcessPragma_Warning_RemoveDiagnostic(void *this, uint32_t diagnosticCode);
static bool ProcessPragma_Warning_GetDiagnosticCode(void *this, uint32_t *diagCode)
{
	PPInput input;
	char stringBuffer[35];
	char *string = &stringBuffer[0];
	int32_t stringLength;
	uint32_t numericData[3] = {0x20, 0, 0};
	uint8_t unkData[36];

	PPGetCurrent(&input, this);

	if (input.token != 7)
	{
		ExpectedXError(this, 7);
		return false;
	}

	stringLength = FUN_8101f554(&input, &string, *(void **)(*(void **)(this + 0x10) + 0x50));
	FUN_81016160(unkData, string, string + stringLength, input.line, input.column, *(void **)(this + 0x10));

	if (unkData[22])
	{
		return false;
	}

	if (unkData[21] || unkData[20])
	{
		SingleParamError(this, 0x800064, PPGetString(&input));
		return false;
	}

	FUN_810163b8(unkData, numericData);

	*diagCode = numericData[1];

	return true;
}
static bool ProcessPragma_Warning_ApplyWarningMode(void *this, bool diagPragma, int32_t warningMode, uint32_t delimiter)
{
	PPInput input;
	uint32_t diagCode;
	void *unkPtr = NULL;
	uint32_t unkData[2];

	PPNext(this);
	PPGetCurrent(&input, this);

	if (input.token != 0x2F && !diagPragma) // ':' for warning
	{
		ExpectedXError(this, 0x2F);
		return false;
	}
	else if (input.token != 0x23 && diagPragma) // '=' for diag
	{
		ExpectedXError(this, 0x23);
		return false;
	}

	PPNext(this);
	PPGetCurrent(&input, this);
	while (input.token == 7)
	{
		if (ProcessPragma_Warning_GetDiagnosticCode(this, &diagCode) == 0)
		{
			return false;
		}

		ProcessPragma_Warning_ResetWarningContainer(this);
		switch (warningMode)
		{
		case 0:
			FUN_81216ccc(&unkPtr, *(void **)(*(void **)(this + 0x10) + 0x60));
			FUN_81215b1c(unkPtr, diagCode); // Add to disable set
			FUN_812015f4(&unkPtr);
			break;
		case 1:
			FUN_81216ccc(&unkPtr, *(void **)(*(void **)(this + 0x10) + 0x60));
			ProcessPragma_Warning_RemoveDiagnostic(unkPtr + 0x14, diagCode); // Remove from error set
			ProcessPragma_Warning_RemoveDiagnostic(unkPtr + 8, diagCode);	 // Remove from disable set
			FUN_812015f4(&unkPtr);
			break;
		case 2:
			FUN_81216ccc(&unkPtr, *(void **)(*(void **)(this + 0x10) + 0x60));
			FUN_812012f0(unkData, unkPtr + 0x14, &diagCode); // Add to error set
			FUN_812015f4(&unkPtr);
			break;
		case 3:
			FUN_81003b6c(*(void **)(this + 0x10), diagCode); // Add to once set
			break;
		}

		PPNext(this);
		PPGetCurrent(&input, this);

		if (input.token == delimiter)
		{
			PPNext(this);
			PPGetCurrent(&input, this);
		}
	}

	return true;
}
static void ProcessPragma_Warning(void *this)
{
	PPInput currentInput;
	char *string;

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 0x32) // '('
	{
		ExpectedXError(this, 0x32);
		ProcessPragma_Skip(this);
		return;
	}

	do
	{
		PPNext(this);
		PPGetCurrent(&currentInput, this);

		if (currentInput.token == 0x37) // ';'
			continue;

		if (!PPIsValidForString(&currentInput))
		{
			ExpectedXError(this, 6);
			ProcessPragma_Skip(this);
			return;
		}

		string = PPGetString(&currentInput);

		if (sceClibStrcmp(string, "disable") == 0)
		{
			if (ProcessPragma_Warning_ApplyWarningMode(this, false, 0, -1 /* no delimiter */) == false)
			{
				ProcessPragma_Skip(this);
				return;
			}
		}
		else if (sceClibStrcmp(string, "default") == 0)
		{
			if (ProcessPragma_Warning_ApplyWarningMode(this, false, 1, -1 /* no delimiter */) == false)
			{
				ProcessPragma_Skip(this);
				return;
			}
		}
		else if (sceClibStrcmp(string, "error") == 0)
		{
			if (ProcessPragma_Warning_ApplyWarningMode(this, false, 2, -1 /* no delimiter */) == false)
			{
				ProcessPragma_Skip(this);
				return;
			}
		}
		else if (sceClibStrcmp(string, "once") == 0)
		{
			if (ProcessPragma_Warning_ApplyWarningMode(this, false, 3, -1 /* no delimiter */) == false)
			{
				ProcessPragma_Skip(this);
				return;
			}
		}
		else if (sceClibStrcmp(string, "push") == 0)
		{
			ProcessPragma_Warning_PushWarningState(this);
		}
		else if (sceClibStrcmp(string, "pop") == 0)
		{
			if (ProcessPragma_Warning_PopWarningState(this) == false)
			{
				NoParamError(this, 0x800065);
				ProcessPragma_Skip(this);
				return;
			}
		}
		else
		{
			SingleParamError(this, 0x800063, string);
			ProcessPragma_Skip(this);
			return;
		}

		PPGetCurrent(&currentInput, this);
	} while (currentInput.token == 0x37); // ';'

	if (currentInput.token != 0x33) // ')'
	{
		ExpectedXError(this, 0x33);
		ProcessPragma_Skip(this);
		return;
	}

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 3 && currentInput.token != 1)
	{
		RogueTokensError(this, WARNING);
		ProcessPragma_Skip(this);
		return;
	}

	if (currentInput.token == 3)
	{
		PPNext(this);
	}
}

static void ProcessPragma_Diag(void *this)
{
	PPInput currentInput;
	char *string;

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 0x11)
	{
		ExpectedXError(this, 0x11);
		ProcessPragma_Skip(this);
		return;
	}

	PPNext(this);
	PPGetCurrent(&currentInput, this);

	if (!PPIsValidForString(&currentInput))
	{
		ExpectedXError(this, 6);
		ProcessPragma_Skip(this);
		return;
	}

	string = PPGetString(&currentInput);

	if (sceClibStrcmp(string, "suppress") == 0)
	{
		if (ProcessPragma_Warning_ApplyWarningMode(this, true, 0, 0x1C /* , */) == false)
		{
			ProcessPragma_Skip(this);
			return;
		}
	}
	else if (sceClibStrcmp(string, "error") == 0)
	{
		if (ProcessPragma_Warning_ApplyWarningMode(this, true, 2, 0x1C /* , */) == false)
		{
			ProcessPragma_Skip(this);
			return;
		}
	}
	else if (sceClibStrcmp(string, "push") == 0)
	{
		ProcessPragma_Warning_PushWarningState(this);
	}
	else if (sceClibStrcmp(string, "pop") == 0)
	{
		if (ProcessPragma_Warning_PopWarningState(this) == false)
		{
			NoParamError(this, 0x800065);
			ProcessPragma_Skip(this);
			return;
		}
	}
	else
	{
		SingleParamError(this, 0x800063, string);
		ProcessPragma_Skip(this);
		return;
	}

	PPNext(this);
	PPGetCurrent(&currentInput, this);
	if (currentInput.token != 3 && currentInput.token != 1)
	{
		RogueTokensError(this, DIAGNOSTIC);
		ProcessPragma_Skip(this);
		return;
	}

	if (currentInput.token == 3)
	{
		PPNext(this);
	}
}
