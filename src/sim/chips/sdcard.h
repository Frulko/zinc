// SD card in SPI mode (ZN-297): the init dance of every SD library (>= 74 clocks with CS high, CMD0 -> idle, CMD8 -> R7 echo, CMD55 + ACMD41 until ready, CMD58 -> OCR), then CMD17 single block read
// (R1, the 0xFE token, 512 data bytes, CRC16) and CMD24 single block write (R1, token 0xFE, 512 bytes, CRC, data response 0x05) over an in-memory image. A command before CMD0, a block
// beyond the image or a card used before it left idle is reported. `xfer` takes one byte the driver clocks out and returns the byte the card clocks back.
#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace zn::sim {

struct SdCard {
  std::vector<uint8_t> image;          // the card's blocks (512 bytes each)
  std::vector<std::string> errors;
  bool csLow = false, idle = true, started = false, app = false, hcCard = true;
  int clocksWithCsHigh = 0;
  uint8_t cmd[6] = {}; int have = 0;
  std::vector<uint8_t> out; size_t outAt = 0;   // bytes queued for the driver
  std::vector<uint8_t> blockIn; uint32_t writeBlock = 0; bool receiving = false;

  explicit SdCard(size_t blocks = 64) : image(blocks * 512, 0) {}
  void select(bool low) { csLow = low; have = 0; if (!low) { receiving = false; } }
  uint8_t xfer(uint8_t tx) {
    if (!csLow) { clocksWithCsHigh += 8; return 0xFF; }
    uint8_t r = 0xFF;
    if (outAt < out.size()) r = out[outAt++]; else { out.clear(); outAt = 0; }
    if (receiving) { if (blockIn.empty() && tx == 0xFF) return r;   // the idle byte before the data token
      blockIn.push_back(tx); if (blockIn.size() == 1 && tx != 0xFE) { errors.push_back("write block without the 0xFE token"); receiving = false; blockIn.clear(); return r; } if (blockIn.size() == 1 + 512 + 2) finishWrite(); return r; }
    if (have == 0 && (tx & 0xC0) != 0x40) return r;   // idle clocks (0xFF) between commands
    cmd[have++] = tx;
    if (have == 6) { have = 0; command(cmd[0] & 0x3F, (uint32_t)cmd[1] << 24 | (uint32_t)cmd[2] << 16 | (uint32_t)cmd[3] << 8 | cmd[4]); }
    return r;
  }
  void queue(std::initializer_list<uint8_t> b) { out.insert(out.end(), 0xFF); out.insert(out.end(), b); }   // one 0xFF of latency (NCR), then the response
  void command(int c, uint32_t arg) {
    const bool wasApp = app; app = false;
    if (!started && c != 0) { errors.push_back("CMD" + std::to_string(c) + " before CMD0"); queue({0xFF}); return; }
    switch (c) {
      case 0:
        if (clocksWithCsHigh < 74) errors.push_back("CMD0 after " + std::to_string(clocksWithCsHigh) + " clocks with CS high (>= 74 needed)");
        started = true; idle = true; queue({0x01}); break;
      case 8: queue({idle ? (uint8_t)0x01 : (uint8_t)0x00, 0x00, 0x00, (uint8_t)((arg >> 8) & 0x0F), (uint8_t)(arg & 0xFF)}); break;
      case 55: app = true; queue({idle ? (uint8_t)0x01 : (uint8_t)0x00}); break;
      case 41:
        if (!wasApp) { errors.push_back("ACMD41 without CMD55"); queue({0x04}); break; }
        idle = false; queue({0x00}); break;
      case 58: queue({0x00, (uint8_t)(hcCard ? 0xC0 : 0x80), 0xFF, 0x80, 0x00}); break;
      case 16: queue({0x00}); break;
      case 17: {
        if (idle) { errors.push_back("CMD17 while the card is still idle"); queue({0x04}); break; }
        const uint32_t blk = hcCard ? arg : arg / 512;
        if ((size_t)(blk + 1) * 512 > image.size()) { errors.push_back("CMD17 block " + std::to_string(blk) + " is beyond the card"); queue({0x40}); break; }   // parameter error
        out.push_back(0xFF); out.push_back(0x00); out.push_back(0xFF); out.push_back(0xFE);
        out.insert(out.end(), image.begin() + blk * 512, image.begin() + (blk + 1) * 512);
        out.push_back(0x00); out.push_back(0x00);   // CRC16 (not checked in SPI mode)
        break;
      }
      case 24: {
        if (idle) { errors.push_back("CMD24 while the card is still idle"); queue({0x04}); break; }
        writeBlock = hcCard ? arg : arg / 512;
        if ((size_t)(writeBlock + 1) * 512 > image.size()) { errors.push_back("CMD24 block " + std::to_string(writeBlock) + " is beyond the card"); queue({0x40}); break; }
        queue({0x00}); receiving = true; blockIn.clear(); break;
      }
      default: errors.push_back("CMD" + std::to_string(c) + " is not supported by this model"); queue({0x04}); break;
    }
  }
  void finishWrite() {
    std::memcpy(&image[writeBlock * 512], &blockIn[1], 512);
    receiving = false; blockIn.clear();
    out.push_back(0xFF); out.push_back(0x05); out.push_back(0x00); out.push_back(0xFF);   // data accepted, then busy until 0xFF
  }
};

}  // namespace zn::sim
