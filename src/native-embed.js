// Chamadas Win32 (via koffi) usadas para embutir o mpv como filho nativo
// direto da janela principal. O Electron so sabe mover/redimensionar suas
// proprias janelas (BrowserWindow.setBounds()); nao existe API dele pra
// reposicionar uma janela nativa de terceiros (o hwnd do mpv) dentro de uma
// das nossas janelas, entao isso precisa ser feito com a API do Windows.
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const DWORD = koffi.alias('DWORD', 'uint32_t');
const HANDLE = koffi.pointer('HANDLE', koffi.opaque());
const HWND = koffi.alias('HWND', HANDLE);

const FindWindowExW = user32.func(
  'HWND __stdcall FindWindowExW(HWND hWndParent, HWND hWndChildAfter, const char16_t *lpszClass, const char16_t *lpszWindow)'
);
const GetWindowThreadProcessId = user32.func(
  'DWORD __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ DWORD *lpdwProcessId)'
);
const SetWindowPos = user32.func(
  'bool __stdcall SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)'
);

const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_SHOWWINDOW = 0x0040;
const SWP_HIDEWINDOW = 0x0080;

// Acha, entre os filhos diretos de parentHandle, a janela que pertence ao
// processo `pid` — e assim que descobrimos o hwnd que o mpv criou ao ser
// embutido via --wid, ja que o mpv nao devolve esse handle pra gente.
// parentHandle pode ser o Buffer que o Electron devolve em
// getNativeWindowHandle() (aceito diretamente por koffi como HWND de
// entrada) ou um handle (BigInt) recebido de uma chamada nativa anterior.
function findChildHwndByPid(parentHandle, pid, maxIterations = 500) {
  let child = 0;
  for (let i = 0; i < maxIterations; i++) {
    child = FindWindowExW(parentHandle, child, null, null);
    if (!child) return null;
    const pidOut = [null];
    GetWindowThreadProcessId(child, pidOut);
    if (pidOut[0] === pid) return child;
  }
  return null;
}

// Diagnostico: lista TODOS os filhos diretos de parentHandle com seu PID
// dono, sem filtrar por nenhum pid especifico — usado quando
// findChildHwndByPid falha, pra entender se a janela do mpv apareceu com um
// PID inesperado ou se ela simplesmente nao esta entre os filhos diretos.
function listChildWindows(parentHandle, maxIterations = 500) {
  const results = [];
  let child = 0;
  for (let i = 0; i < maxIterations; i++) {
    child = FindWindowExW(parentHandle, child, null, null);
    if (!child) break;
    const pidOut = [null];
    GetWindowThreadProcessId(child, pidOut);
    results.push({ hwnd: String(child), pid: pidOut[0] });
  }
  return results;
}

// Reposiciona (ou esconde, se width/height forem 0 ou negativos) a janela
// nativa embutida — equivalente ao setBounds()/hide() de uma BrowserWindow,
// so que pra uma janela que nao e do Electron. x/y/width/height devem estar
// em pixels fisicos (ja multiplicados pelo scaleFactor do monitor), nao em
// pixels logicos/DIP como as APIs do Electron usam.
function positionEmbeddedWindow(hwnd, x, y, width, height) {
  if (!hwnd) return;
  const visible = width > 0 && height > 0;
  const flags = SWP_NOZORDER | SWP_NOACTIVATE | (visible ? SWP_SHOWWINDOW : SWP_HIDEWINDOW);
  SetWindowPos(hwnd, 0, Math.round(x), Math.round(y), Math.max(0, Math.round(width)), Math.max(0, Math.round(height)), flags);
}

module.exports = { findChildHwndByPid, positionEmbeddedWindow, listChildWindows };
