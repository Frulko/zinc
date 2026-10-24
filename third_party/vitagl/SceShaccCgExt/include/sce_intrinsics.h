static const char *sce_intrinsics =
    R"(///	SCE CONFIDENTIAL
///	Copyright (C) 2012 Sony Computer Entertainment Inc.
///	All Rights Reserved.
///

//
// Example custom builtin
//
//float4 texTESTD(sampler2D samp, float2 s)	__attribute__((Builtin, BuiltinUID("TEX_TEST_D"), AcceptsTemplateType(1)));


//
// fastblend
//

// BLEND_OP_XXX for fastblend intrinsic
#define __BLEND_OP_ADD 1
#define __BLEND_OP_SUB 2
#define __BLEND_OP_MIN 3
#define __BLEND_OP_MAX 4

// BLEND_FACTOR_XXX for fastblend intrinsic
#define __BLEND_FACTOR_ZERO 1
#define __BLEND_FACTOR_ONE 2
#define __BLEND_FACTOR_SRC1 3
#define __BLEND_FACTOR_ONE_MINUS_SRC1 4
#define __BLEND_FACTOR_SRC2 5
#define __BLEND_FACTOR_ONE_MINUS_SRC2 6
#define __BLEND_FACTOR_SRC3 7
#define __BLEND_FACTOR_ONE_MINUS_SRC3 8
#define __BLEND_FACTOR_SRC1_ALPHA 9
#define __BLEND_FACTOR_ONE_MINUS_SRC1_ALPHA 10
#define __BLEND_FACTOR_SRC2_ALPHA 11
#define __BLEND_FACTOR_ONE_MINUS_SRC2_ALPHA 12
#define __BLEND_FACTOR_SRC3_ALPHA 13
#define __BLEND_FACTOR_ONE_MINUS_SRC3_ALPHA 14

// BLEND_WMASK_XXX for fastblend intrinsic
#define __BLEND_WMASK_R 1
#define __BLEND_WMASK_G 2
#define __BLEND_WMASK_B 4
#define __BLEND_WMASK_A 8
#define __BLEND_WMASK_RGB 7
#define __BLEND_WMASK_RGBA 15

#define FASTBLEND(TYPE) \
	TYPE __fastblend( \
		TYPE src1, \
		TYPE src2, \
		int colorBlendOperation, \
		int colorFactor1, \
		int colorFactor2, \
		int alphaBlendOperation, \
		int alphaFactor1, \
		int alphaFactor2) \
			__attribute__(( \
				Intrinsic, \
				OpcodeName("FBLEND"))); \
	TYPE __fastblend3( \
		TYPE src1, \
		TYPE src2, \
		TYPE src3, \
		int colorBlendOperation, \
		int colorFactor1, \
		int colorFactor2, \
		int alphaBlendOperation, \
		int alphaFactor1) \
			__attribute__(( \
				Intrinsic, \
				OpcodeName("FBLEND3"))); \
	TYPE __fastblend_writemask( \
		TYPE src1, \
		TYPE src2, \
		int colorBlendOperation, \
		int factor1, \
		int factor2, \
		int alphaBlendOperation, \
		TYPE passThrough, \
		int writeMask) \
			__attribute__(( \
				Intrinsic, \
				OpcodeName("FWBLEND")));

FASTBLEND(unsigned char)
FASTBLEND(unsigned char2)
FASTBLEND(unsigned char3)
FASTBLEND(unsigned char4)
FASTBLEND(fixed)
FASTBLEND(fixed2)
FASTBLEND(fixed3)
FASTBLEND(fixed4)
#undef FASTBLEND


//
// min max
//
#define MIN_MAX(TYPE) \
	TYPE __min(TYPE a, TYPE b) \
		__attribute__(( \
			Intrinsic, \
			OpcodeName("MIN"))); \
	TYPE __max(TYPE a, TYPE b) \
		__attribute__(( \
			Intrinsic, \
			OpcodeName("MAX")));

MIN_MAX(char)
MIN_MAX(char2)
MIN_MAX(char3)
MIN_MAX(char4)
MIN_MAX(unsigned char)
MIN_MAX(unsigned char2)
MIN_MAX(unsigned char3)
MIN_MAX(unsigned char4)
#undef MIN_MAX

//
// special register reads
//
unsigned short __pixel_x() __attribute__((Intrinsic, OpcodeName("PIXEL_X")));
unsigned short __pixel_y() __attribute__((Intrinsic, OpcodeName("PIXEL_Y")));
unsigned char2 __tile_xy() __attribute__((Intrinsic, OpcodeName("TILE_XY")));
unsigned short __backfaceControl() __attribute__((Intrinsic, OpcodeName("BFACE_CTRL")));

//
// U8 Saturated Operation Intrinsics
//
#define MUL_SAT(TYPE) \
	TYPE __mul_sat(TYPE a,  TYPE b) \
		__attribute__(( \
			Intrinsic, \
			OpcodeName("MULSAT")));
MUL_SAT(unsigned char)
MUL_SAT(unsigned char2)
MUL_SAT(unsigned char3)
MUL_SAT(unsigned char4)
#undef MUL_SAT

#define ADD_SAT(TYPE) \
	TYPE __add_sat(TYPE a,  TYPE b) \
		__attribute__(( \
			Intrinsic, \
			OpcodeName("ADDSAT")));
ADD_SAT(unsigned char)
ADD_SAT(unsigned char2)
ADD_SAT(unsigned char3)
ADD_SAT(unsigned char4)
#undef ADD_SAT


//
// extract control word data from sampler values
//
unsigned int __getTexCtrlWord(sampler1D s, unsigned int cwIndex) __attribute__((Intrinsic, OpcodeName("GETTEXCTRLWORD"), Internal));
unsigned int __getTexCtrlWord(isampler1D s, unsigned int cwIndex) __attribute__((Intrinsic, OpcodeName("GETTEXCTRLWORD"), Internal));
unsigned int __getTexCtrlWord(usampler1D s, unsigned int cwIndex) __attribute__((Intrinsic, OpcodeName("GETTEXCTRLWORD"), Internal));
unsigned int __getTexCtrlWord(sampler2D s, unsigned int cwIndex) __attribute__((Intrinsic, OpcodeName("GETTEXCTRLWORD"), Internal));
unsigned int __getTexCtrlWord(isampler2D s, unsigned int cwIndex) __attribute__((Intrinsic, OpcodeName("GETTEXCTRLWORD"), Internal));
unsigned int __getTexCtrlWord(usampler2D s, unsigned int cwIndex) __attribute__((Intrinsic, OpcodeName("GETTEXCTRLWORD"), Internal));
unsigned int __getTexCtrlWord(samplerCUBE s, unsigned int cwIndex) __attribute__((Intrinsic, OpcodeName("GETTEXCTRLWORD"), Internal));
unsigned int __getTexCtrlWord(isamplerCUBE s, unsigned int cwIndex) __attribute__((Intrinsic, OpcodeName("GETTEXCTRLWORD"), Internal));
unsigned int __getTexCtrlWord(usamplerCUBE s, unsigned int cwIndex) __attribute__((Intrinsic, OpcodeName("GETTEXCTRLWORD"), Internal));

//
// create sampler type from unsigned int data
//
sampler2D __createSampler2D(unsigned int word0, unsigned int word1, unsigned int word2, unsigned int word4) __attribute__((Intrinsic, OpcodeName("CREATESAMPLER2D"), Internal));
isampler2D __createISampler2D(unsigned int word0, unsigned int word1, unsigned int word2, unsigned int word4) __attribute__((Intrinsic, OpcodeName("CREATESAMPLER2D"), Internal));
usampler2D __createUSampler2D(unsigned int word0, unsigned int word1, unsigned int word2, unsigned int word4) __attribute__((Intrinsic, OpcodeName("CREATESAMPLER2D"), Internal));
samplerCUBE __createSamplerCube(unsigned int word0, unsigned int word1, unsigned int word2, unsigned int word4) __attribute__((Intrinsic, OpcodeName("CREATESAMPLERCUBE"), Internal));
isamplerCUBE __createISamplerCube(unsigned int word0, unsigned int word1, unsigned int word2, unsigned int word4) __attribute__((Intrinsic, OpcodeName("CREATESAMPLERCUBE"), Internal));
usamplerCUBE __createUSamplerCube(unsigned int word0, unsigned int word1, unsigned int word2, unsigned int word4) __attribute__((Intrinsic, OpcodeName("CREATESAMPLERCUBE"), Internal));


//
// sampling information texture functions (.sinf)
//
unsigned char4 __tex1D_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float uv) __attribute__((Intrinsic, OpcodeName("TEX1D_SINF"), Internal));
unsigned char4 __tex1D_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float uv, float dx, float dy) __attribute__((Intrinsic, OpcodeName("TEX1D_SINF"), Internal));
unsigned char4 __tex1Dlod_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float4 uv) __attribute__((Intrinsic, OpcodeName("TEX1DLOD_SINF"), Internal));
unsigned char4 __tex1Dbias_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float4 uv) __attribute__((Intrinsic, OpcodeName("TEX1DBIAS_SINF"), Internal));
unsigned char4 __tex2D_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float2 uv) __attribute__((Intrinsic, OpcodeName("TEX2D_SINF"), Internal));
unsigned char4 __tex2D_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float2 uv, float2 dx, float2 dy) __attribute__((Intrinsic, OpcodeName("TEX2D_SINF"), Internal));
unsigned char4 __tex2Dlod_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float4 uv) __attribute__((Intrinsic, OpcodeName("TEX2DLOD_SINF"), Internal));
unsigned char4 __tex2Dbias_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float4 uv) __attribute__((Intrinsic, OpcodeName("TEX2DBIAS_SINF"), Internal));
unsigned char4 __texCUBE_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float3 uv) __attribute__((Intrinsic, OpcodeName("TEXCUBE_SINF"), Internal));
unsigned char4 __texCUBE_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float3 uv, float3 dx, float3 dy) __attribute__((Intrinsic, OpcodeName("TEXCUBE_SINF"), Internal));
unsigned char4 __texCUBElod_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float4 uv) __attribute__((Intrinsic, OpcodeName("TEXCUBELOD_SINF"), Internal));
unsigned char4 __texCUBEbias_sinf(unsigned int cw0, unsigned int cw1, unsigned int cw2, unsigned int cw3, float4 uv) __attribute__((Intrinsic, OpcodeName("TEXCUBEBIAS_SINF"), Internal));


#define TEX_SINF(SAMPLERTYPE, XD, UVT)														\
	unsigned char4 tex ## XD ## _info(SAMPLERTYPE smp, UVT uv)								\
	{																						\
		return __tex ## XD ## _sinf(														\
			__getTexCtrlWord(smp, 0),														\
			__getTexCtrlWord(smp, 1),														\
			__getTexCtrlWord(smp, 2),														\
			__getTexCtrlWord(smp, 3),														\
			uv);																			\
	}																						\
	unsigned char4 tex ## XD ## _info(SAMPLERTYPE smp, UVT uv, UVT dx, UVT dy)				\
	{																						\
		return __tex ## XD ## _sinf(														\
			__getTexCtrlWord(smp, 0),														\
			__getTexCtrlWord(smp, 1),														\
			__getTexCtrlWord(smp, 2),														\
			__getTexCtrlWord(smp, 3),														\
			uv, dx, dy);																	\
	}																						\
	unsigned char4 tex ## XD ## lod_info(SAMPLERTYPE smp, float4 uv)						\
	{																						\
		return __tex ## XD ## lod_sinf(														\
			__getTexCtrlWord(smp, 0),														\
			__getTexCtrlWord(smp, 1),														\
			__getTexCtrlWord(smp, 2),														\
			__getTexCtrlWord(smp, 3),														\
			uv);																			\
	}																						\
	unsigned char4 tex ## XD ## bias_info(SAMPLERTYPE smp, float4 uv)						\
	{																						\
		return __tex ## XD ## bias_sinf(													\
			__getTexCtrlWord(smp, 0),														\
			__getTexCtrlWord(smp, 1),														\
			__getTexCtrlWord(smp, 2),														\
			__getTexCtrlWord(smp, 3),														\
			uv);																			\
	}

TEX_SINF(sampler1D, 1D, float)
TEX_SINF(usampler1D, 1D, float)
TEX_SINF(isampler1D, 1D, float)
TEX_SINF(sampler2D, 2D, float2)
TEX_SINF(usampler2D, 2D, float2)
TEX_SINF(isampler2D, 2D, float2)
TEX_SINF(samplerCUBE, CUBE, float3)
TEX_SINF(usamplerCUBE, CUBE, float3)
TEX_SINF(isamplerCUBE, CUBE, float3)
#undef TEX_SINF

//
// texture gather4 (RSD)
//
#define TEXGATHER(SMPTY, RESULTTYPE)																								\
	void tex2D_gather4(SMPTY ## 2D, float2, out RESULTTYPE[4]) __attribute__((Intrinsic, OpcodeName("TEX2D_RSD")));					\
	void tex2D_gather4(SMPTY ## 2D, float2, float2, float2, out RESULTTYPE[4]) __attribute__((Intrinsic, OpcodeName("TEX2D_RSD")));	

TEXGATHER(sampler, float)
TEXGATHER(sampler, float2)
TEXGATHER(sampler, float4)
TEXGATHER(sampler, half)
TEXGATHER(sampler, half2)
TEXGATHER(sampler, half4)
TEXGATHER(usampler, unsigned char)
TEXGATHER(usampler, unsigned char2)
TEXGATHER(usampler, unsigned char4)
TEXGATHER(isampler, signed char)
TEXGATHER(isampler, signed char2)
TEXGATHER(isampler, signed char4)
TEXGATHER(usampler, unsigned short)
TEXGATHER(usampler, unsigned short2)
TEXGATHER(usampler, unsigned short4)
TEXGATHER(isampler, signed short)
TEXGATHER(isampler, signed short2)
TEXGATHER(isampler, signed short4)
TEXGATHER(usampler, unsigned int)
TEXGATHER(usampler, unsigned int2)
TEXGATHER(usampler, unsigned int4)
TEXGATHER(isampler, signed int)
TEXGATHER(isampler, signed int2)
TEXGATHER(isampler, signed int4)
#undef TEXGATHER

//
// texture gather4 (IRSD) - float query format only
//
void tex2D_gather4(sampler2D, float2, out float[4], out half4) __attribute__((Intrinsic, OpcodeName("TEX2D_IRSD")));
void tex2D_gather4(sampler2D, float2, float2, float2, out float[4], out half4) __attribute__((Intrinsic, OpcodeName("TEX2D_IRSD")));)";