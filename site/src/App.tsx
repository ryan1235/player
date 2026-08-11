import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { Hero } from './sections/Hero';
import { WhatIsIt } from './sections/WhatIsIt';
import { Mockup } from './sections/Mockup';
import { Features } from './sections/Features';
import { Trust } from './sections/Trust';
import { HowItWorks } from './sections/HowItWorks';
import { DlnaScene } from './sections/DlnaScene';
import { Compatibility } from './sections/Compatibility';
import { Comparison } from './sections/Comparison';
import { Faq } from './sections/Faq';
import { DownloadFinal } from './sections/DownloadFinal';

export function App() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <WhatIsIt />
        <Mockup />
        <Features />
        <Trust />
        <HowItWorks />
        <DlnaScene />
        <Compatibility />
        <Comparison />
        <Faq />
        <DownloadFinal />
      </main>
      <Footer />
    </>
  );
}
