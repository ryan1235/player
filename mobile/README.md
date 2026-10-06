# ⚡ Aura Remote — Aplicativo Companion Android (Expo)

Aplicativo complementar em **Expo / React Native** para conectar seu celular Android diretamente ao **Aura Player** no computador.

---

## 📱 O que este aplicativo faz?

1. **Captura e Envio de Streams (YouCine / Web)**:
   - **Compartilhamento Direto**: Ao tocar em *"Compartilhar"* ou *"Abrir com player externo"* no YouCine ou em qualquer app do Android, o **Aura Remote** aparece na lista e envia o link direto para o PC.
   - **Colar do Clipboard com 1 toque**: Copie qualquer link de vídeo (`.m3u8`, `.mp4` ou token do YouCine) e toque em *"Colar"* para disparar no PC.
2. **Controle Remoto Completo (Do seu sofá)**:
   - Play, Pause, Voltar 10s, Avançar 10s, Stop.
   - Linha de tempo em tempo real com posição e duração.
   - Ajuste de volume e botão Mudo.
   - Alternar Tela Cheia no PC.
3. **Auto-Descoberta na Rede**:
   - Encontra o IP do seu computador automaticamente na mesma rede Wi-Fi.

---

## 🚀 Como Executar no Celular (Rápido e Fácil)

### Pré-requisitos:
1. No seu celular Android, instale o aplicativo gratuito **Expo Go** pela Google Play Store.
2. Certifique-se de que o celular e o computador estão conectados na **mesma rede Wi-Fi**.

### Passos para rodar:
No terminal do seu computador:

```bash
# 1. Entre na pasta do app mobile
cd mobile

# 2. Instale as dependências (apenas na primeira vez)
npm install

# 3. Inicie o servidor do Expo
npx expo start
```

4. No terminal aparecerá um **QR Code grande**.
5. Abra o **Expo Go** no seu celular Android, toque em *"Scan QR code"* e aponte para a tela.
6. O aplicativo abrirá instantaneamente no seu celular!

---

## 🌐 Como Conectar com o Aura Player no PC

1. No Aura Player aberto no seu PC, vá na aba **Configurações > DLNA (Receber)** para ver o IP do computador (ex: `192.168.1.5`).
2. No app do celular, na aba **Conexão**, confirme o IP e toque em **Testar Conexão** ou use **Encontrar PC Automaticamente**.
3. O indicador superior ficará **🟢 Conectado** e pronto para uso!
