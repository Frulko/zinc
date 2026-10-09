#pragma once
// The transparency log of publications (ZN-343, decision D42): a Merkle log beside the plugin index, hashed as RFC 6962 / 9162 (leaf SHA-256(0x00 || entry),
// node SHA-256(0x01 || left || right)), its checkpoint (size, root) signed with Ed25519 like the index's metadata. An entry is the canonical JSON
// {"path": <index path>, "sha256": <hex>} of a published artifact. The client checks the checkpoint's signature, that it extends the last checkpoint it
// accepted (a consistency proof: a log that rewrote its history is caught) and that the artifact is in it (an inclusion proof). Files under log/:
// checkpoint.json, proof/<leaf hash>.json {index, size, proof}, consistency/<earlier size>.json {from, to, proof} (tools/tlog writes them).
#include <array>
#include <cstdint>
#include <string>
#include <vector>

#include "tc/tuf.h"

namespace zn::tc::tlog {

using Hash = std::array<std::uint8_t, 32>;

Hash leafHash(const std::string& entry);
std::string entryOf(const std::string& path, const std::string& sha256);
// RFC 9162 2.1.3.2 and 2.1.4.2.
bool verifyInclusion(std::uint64_t index, std::uint64_t size, const Hash& leaf, const std::vector<Hash>& proof, const Hash& root);
bool verifyConsistency(std::uint64_t first, std::uint64_t second, const Hash& firstRoot, const Hash& secondRoot, const std::vector<Hash>& proof);

// The log at log/ of the index `fetch` reads: the artifact (path, sha256) must be in a checkpoint signed by `logKey` (hex Ed25519) that is consistent with
// the one kept in `stateFile` (written back when it moved on). False with `err` naming what failed.
bool checkArtifact(const tuf::Fetch& fetch, const std::string& logKey, const std::string& stateFile, const std::string& path, const std::string& sha256, std::string& err);

}  // namespace zn::tc::tlog
