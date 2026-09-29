#include "zinc_native_samples.h"
struct Samples final : NativeSamples {
  zrt::Ref<m_records_sample_spec::Sample> sample(int32_t value) override {
    auto out=zrt::make<m_records_sample_spec::Sample>();
    out->value=value;out->label=zrt::String::from("hello",5);out->ready=value>0;return out;
  }
};
NativeSamples* zinc_create_Samples(){static Samples samples;samples.rc=zrt::IMMORTAL;return &samples;}
