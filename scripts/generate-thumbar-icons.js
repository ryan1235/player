const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, drawFn) {
  const bytesPerPixel = 4;
  const rawData = Buffer.alloc(height * (1 + width * bytesPerPixel));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * bytesPerPixel);
    rawData[rowOffset] = 0; // filter byte: none
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * bytesPerPixel;
      const rgba = drawFn(x, y, width, height);
      rawData[pxOffset] = rgba[0];
      rawData[pxOffset + 1] = rgba[1];
      rawData[pxOffset + 2] = rgba[2];
      rawData[pxOffset + 3] = rgba[3];
    }
  }

  const deflated = zlib.deflateSync(rawData);

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type 6: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.resolve(__dirname, '../assets/icons');
fs.mkdirSync(iconsDir, { recursive: true });

// 1. Play Icon (Triangle)
const playPng = createPng(24, 24, (x, y) => {
  if (x >= 7 && x <= 18 && y >= 4 && y <= 20) {
    const maxX = 7 + (y <= 12 ? (y - 4) * 1.4 : (20 - y) * 1.4);
    if (x <= maxX) return [255, 255, 255, 255];
  }
  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(iconsDir, 'thumbar-play.png'), playPng);

// 2. Pause Icon (Two vertical bars)
const pausePng = createPng(24, 24, (x, y) => {
  if (y >= 5 && y <= 19) {
    if ((x >= 6 && x <= 9) || (x >= 14 && x <= 17)) return [255, 255, 255, 255];
  }
  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(iconsDir, 'thumbar-pause.png'), pausePng);

// 3. Back 10s Icon (Two triangles pointing left)
const backPng = createPng(24, 24, (x, y) => {
  if (y >= 6 && y <= 18) {
    const minX1 = 11 - (y <= 12 ? (y - 6) * 1.1 : (18 - y) * 1.1);
    if (x >= minX1 && x <= 11) return [255, 255, 255, 255];
    const minX2 = 19 - (y <= 12 ? (y - 6) * 1.1 : (18 - y) * 1.1);
    if (x >= minX2 && x <= 19) return [255, 255, 255, 255];
  }
  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(iconsDir, 'thumbar-back.png'), backPng);

// 4. Forward 10s Icon (Two triangles pointing right)
const fwdPng = createPng(24, 24, (x, y) => {
  if (y >= 6 && y <= 18) {
    const maxX1 = 5 + (y <= 12 ? (y - 6) * 1.1 : (18 - y) * 1.1);
    if (x >= 5 && x <= maxX1) return [255, 255, 255, 255];
    const maxX2 = 13 + (y <= 12 ? (y - 6) * 1.1 : (18 - y) * 1.1);
    if (x >= 13 && x <= maxX2) return [255, 255, 255, 255];
  }
  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(iconsDir, 'thumbar-fwd.png'), fwdPng);

console.log('✔ Thumbar icons generated successfully in assets/icons/');
