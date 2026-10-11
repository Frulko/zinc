// Jolt Physics 5.6.0 as four translation units (ours; vendor/jolt/ holds the release's files, see vendor/jolt/PIN): 1 of 4, the core, the
// math and the geometry. A unity build compiles the library in minutes instead of a quarter of an hour on the development machine, and the
// plugin builder keeps the result in the vendor archive of its cache, so an edit of the plugin's own code never recompiles it.
// Not built: RegisterTypes.cpp (its type factory serves serialization; the plugin registers the shapes itself), the debug renderer, the
// object streams.
#include <Jolt/Jolt.h>

#include "jolt/Jolt/AABBTree/AABBTreeBuilder.cpp"
#include "jolt/Jolt/Core/Color.cpp"
#include "jolt/Jolt/Core/Factory.cpp"
#include "jolt/Jolt/Core/IssueReporting.cpp"
#include "jolt/Jolt/Core/JobSystemSingleThreaded.cpp"
#include "jolt/Jolt/Core/JobSystemThreadPool.cpp"
#include "jolt/Jolt/Core/JobSystemWithBarrier.cpp"
#include "jolt/Jolt/Core/LinearCurve.cpp"
#include "jolt/Jolt/Core/Memory.cpp"
#include "jolt/Jolt/Core/Profiler.cpp"
#include "jolt/Jolt/Core/RTTI.cpp"
#include "jolt/Jolt/Core/Semaphore.cpp"
#include "jolt/Jolt/Core/StringTools.cpp"
#include "jolt/Jolt/Core/TickCounter.cpp"
#include "jolt/Jolt/Geometry/ConvexHullBuilder.cpp"
#include "jolt/Jolt/Geometry/ConvexHullBuilder2D.cpp"
#include "jolt/Jolt/Geometry/Indexify.cpp"
#include "jolt/Jolt/Geometry/OrientedBox.cpp"
#include "jolt/Jolt/Math/Vec3.cpp"
#include "jolt/Jolt/ObjectStream/SerializableObject.cpp"
#include "jolt/Jolt/TriangleSplitter/TriangleSplitter.cpp"
#include "jolt/Jolt/TriangleSplitter/TriangleSplitterBinning.cpp"
#include "jolt/Jolt/TriangleSplitter/TriangleSplitterMean.cpp"
