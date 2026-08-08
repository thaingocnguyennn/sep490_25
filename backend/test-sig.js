const fs = require('fs');

function isCAName(name) {
  const upper = name.toUpperCase();
  return (
    upper.includes(' CA') ||
    upper.includes('CERTIFICATION AUTHORITY') ||
    upper.includes('CERTIFICATE AUTHORITY') ||
    upper.includes('NATIONAL ROOT') ||
    upper.includes('ROOT CA') ||
    upper.includes('TRUST CA') ||
    upper.includes('INTERMEDIATE') ||
    /^[A-Z\s]+CA$/.test(upper.trim())
  );
}

function isValidPersonName(value) {
  if (!value || value.trim().length < 2) return false;
  const trimmed = value.trim();
  if (/^\d+(\.\d+){1,4}$/.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^[0-9a-fA-F]{16,}$/.test(trimmed)) return false;
  if (/^[^a-zA-ZÀ-ỹ]+$/.test(trimmed)) return false;
  return true;
}

function extractCNFromDER(der) {
  if (!der) {
    console.log("der is null");
    return null;
  }
  try {
    const allCNs = [];
    for (let i = 0; i < der.length - 8; i++) {
      if (der[i] === 0x55 && der[i + 1] === 0x04 && der[i + 2] === 0x03) {
        for (let j = i + 3; j < Math.min(i + 12, der.length - 2); j++) {
          const tag = der[j];
          if (tag === 0x0C || tag === 0x13 || tag === 0x16 || tag === 0x14) {
            const len = der[j + 1];
            if (len >= 2 && len <= 128 && j + 2 + len <= der.length) {
              const name = der.slice(j + 2, j + 2 + len).toString('utf8').trim();
              if (isValidPersonName(name)) allCNs.push(name);
            }
            break;
          } else if (tag === 0x1e) {
            const len = der[j + 1];
            if (len >= 4 && len <= 256 && j + 2 + len <= der.length) {
              const bmpBytes = der.slice(j + 2, j + 2 + len);
              const swapped = Buffer.alloc(bmpBytes.length);
              for (let k = 0; k < bmpBytes.length - 1; k += 2) {
                swapped[k] = bmpBytes[k + 1];
                swapped[k + 1] = bmpBytes[k];
              }
              const name = swapped.toString('utf16le').trim();
              if (isValidPersonName(name)) allCNs.push(name);
            }
            break;
          }
        }
      }
    }
    console.log("Found CNs:", allCNs);
    if (allCNs.length === 0) return null;
    const signerCN = allCNs.find(cn => !isCAName(cn));
    if (signerCN) return signerCN;
    return allCNs[0];
  } catch (err) {
    console.error(err);
    return null;
  }
}

// Find a PDF in the uploads dir?
// Let's just output the script
const dir = fs.readdirSync('./uploads');
const pdfs = dir.filter(f => f.endsWith('.pdf'));
if (pdfs.length > 0) {
  const buf = fs.readFileSync('./uploads/' + pdfs[0]);
  const content = buf.toString('latin1');
  const byteRangeRegex = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const matches = [...content.matchAll(byteRangeRegex)];
  
  matches.forEach((match, index) => {
    console.log("Testing signature", index);
    const gapStart = Number(match[1]) + Number(match[2]);
    const gapEnd = Number(match[3]);
    let derBuffer = null;
    const gapContent = buf.slice(gapStart, gapEnd).toString('latin1');
    const startBracket = gapContent.indexOf('<');
    const endBracket = gapContent.lastIndexOf('>');
    if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
      const hex = gapContent.substring(startBracket + 1, endBracket).replace(/\s/g, '');
      console.log("Found hex of length", hex.length);
      derBuffer = Buffer.from(hex, 'hex');
    } else {
      console.log("No < > brackets found in gap");
    }
    extractCNFromDER(derBuffer);
  });
} else {
  console.log("No PDFs found");
}
