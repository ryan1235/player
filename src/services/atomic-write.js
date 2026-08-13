const fs = require('fs');

// fs.writeFileSync direto trunca o arquivo antes de escrever o conteudo novo
// — se o processo morrer no meio (crash, reboot forcado, encerramento
// abrupto do Windows Update) o arquivo fica truncado/invalido, e o proximo
// _load() cai no fallback vazio, perdendo settings/biblioteca/historico
// inteiros em vez de manter o ultimo estado bom. Escrever num arquivo
// temporario ao lado e so trocar via rename (atomico no mesmo volume) evita
// essa janela: o arquivo final e sempre o conteudo antigo OU o novo
// completo, nunca parcial.
function atomicWriteFileSync(filePath, contents) {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, contents);
  fs.renameSync(tmpPath, filePath);
}

module.exports = { atomicWriteFileSync };
