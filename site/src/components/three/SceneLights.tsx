// Rig de luz de "estudio de fotografia de produto" — ambient alta + key
// light forte de cima/frente + fill suave do lado oposto + um leve rim em
// accent pra dar um brilho de marca na borda dos objetos. Pensado pra
// objetos com carcaca escura contra fundo claro (como foto de gadget real),
// nao mais pra objetos emissivos flutuando no vazio escuro.
export function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} color="#ffffff" />
      <directionalLight position={[-5, 3, -2]} intensity={0.55} color="#ffffff" />
      <pointLight position={[-3, -1.5, 2]} intensity={5} color="#5b7cfa" distance={9} decay={2} />
      <pointLight position={[3, 2, -2]} intensity={3} color="#8b6cf0" distance={9} decay={2} />
    </>
  );
}
