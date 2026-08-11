/* Visual "how to measure" aids, one schematic per default category.
   Plain inline SVG (no assets) so it themes with the app via CSS vars —
   see the .sz-d-* classes in core/ui/extras.css. */

function BodyDiagram() {
  return (
    <svg viewBox="0 0 300 305" className="sizes-diagram-svg" aria-hidden="true">
      <circle cx="160" cy="20" r="14" className="sz-d-outline" />
      <ellipse cx="160" cy="37" rx="13" ry="5" className="sz-d-measure" />
      <path d="M132,42 C122,68 122,95 130,118 C122,138 122,162 134,182 L186,182 C198,162 198,138 190,118 C198,95 198,68 188,42 Z" className="sz-d-outline" />
      <path d="M134,46 L118,90 L112,138" className="sz-d-outline" />
      <path d="M186,46 L202,90 L208,138" className="sz-d-outline" />
      <path d="M140,182 L134,278" className="sz-d-outline" />
      <path d="M180,182 L186,278" className="sz-d-outline" />

      <line x1="118" y1="46" x2="202" y2="46" className="sz-d-measure" />
      <line x1="118" y1="42" x2="118" y2="50" className="sz-d-tick" />
      <line x1="202" y1="42" x2="202" y2="50" className="sz-d-tick" />
      <line x1="202" y1="46" x2="222" y2="46" className="sz-d-leader" />
      <text x="226" y="49" className="sz-d-label">Shoulder</text>

      <line x1="120" y1="75" x2="200" y2="75" className="sz-d-measure" />
      <line x1="120" y1="71" x2="120" y2="79" className="sz-d-tick" />
      <line x1="200" y1="71" x2="200" y2="79" className="sz-d-tick" />
      <line x1="200" y1="75" x2="222" y2="75" className="sz-d-leader" />
      <text x="226" y="78" className="sz-d-label">Chest / Bust</text>

      <line x1="124" y1="118" x2="196" y2="118" className="sz-d-measure" />
      <line x1="124" y1="114" x2="124" y2="122" className="sz-d-tick" />
      <line x1="196" y1="114" x2="196" y2="122" className="sz-d-tick" />
      <line x1="196" y1="118" x2="222" y2="118" className="sz-d-leader" />
      <text x="226" y="121" className="sz-d-label">Waist</text>

      <line x1="120" y1="178" x2="200" y2="178" className="sz-d-measure" />
      <line x1="120" y1="174" x2="120" y2="182" className="sz-d-tick" />
      <line x1="200" y1="174" x2="200" y2="182" className="sz-d-tick" />
      <line x1="200" y1="178" x2="222" y2="178" className="sz-d-leader" />
      <text x="226" y="181" className="sz-d-label">Hips</text>

      <line x1="173" y1="37" x2="222" y2="30" className="sz-d-leader" />
      <text x="226" y="33" className="sz-d-label">Neck</text>

      <line x1="95" y1="46" x2="90" y2="138" className="sz-d-measure" />
      <line x1="91" y1="46" x2="99" y2="46" className="sz-d-tick" />
      <line x1="86" y1="138" x2="94" y2="138" className="sz-d-tick" />
      <line x1="90" y1="138" x2="62" y2="138" className="sz-d-leader" />
      <text x="58" y="141" textAnchor="end" className="sz-d-label">Arm length</text>

      <line x1="160" y1="186" x2="160" y2="278" className="sz-d-measure" />
      <line x1="156" y1="186" x2="164" y2="186" className="sz-d-tick" />
      <line x1="156" y1="278" x2="164" y2="278" className="sz-d-tick" />
      <text x="160" y="296" textAnchor="middle" className="sz-d-label">Inseam</text>
    </svg>
  );
}

function TshirtDiagram() {
  return (
    <svg viewBox="0 0 260 210" className="sizes-diagram-svg" aria-hidden="true">
      <path d="M100,10 C120,0 140,0 160,10 L190,25 L230,55 L215,80 L185,60 L185,180 L75,180 L75,60 L45,80 L30,55 L70,25 Z" className="sz-d-outline" />

      <line x1="75" y1="100" x2="185" y2="100" className="sz-d-measure" />
      <line x1="75" y1="96" x2="75" y2="104" className="sz-d-tick" />
      <line x1="185" y1="96" x2="185" y2="104" className="sz-d-tick" />
      <line x1="185" y1="100" x2="205" y2="100" className="sz-d-leader" />
      <text x="209" y="103" className="sz-d-label">Chest</text>

      <line x1="110" y1="12" x2="110" y2="180" className="sz-d-measure" />
      <line x1="106" y1="12" x2="114" y2="12" className="sz-d-tick" />
      <line x1="106" y1="180" x2="114" y2="180" className="sz-d-tick" />
      <text x="110" y="196" textAnchor="middle" className="sz-d-label">Length</text>

      <line x1="192" y1="27" x2="213" y2="78" className="sz-d-measure" />
      <line x1="189" y1="30" x2="196" y2="24" className="sz-d-tick" />
      <line x1="209" y1="82" x2="217" y2="75" className="sz-d-tick" />
      <line x1="213" y1="78" x2="233" y2="90" className="sz-d-leader" />
      <text x="237" y="93" className="sz-d-label">Sleeve</text>
    </svg>
  );
}

function PantsDiagram() {
  return (
    <svg viewBox="0 0 260 180" className="sizes-diagram-svg" aria-hidden="true">
      <rect x="60" y="10" width="140" height="18" rx="4" className="sz-d-outline" />
      <rect x="65" y="28" width="45" height="122" className="sz-d-outline" />
      <rect x="150" y="28" width="45" height="122" className="sz-d-outline" />

      <line x1="60" y1="19" x2="200" y2="19" className="sz-d-measure" />
      <line x1="60" y1="15" x2="60" y2="23" className="sz-d-tick" />
      <line x1="200" y1="15" x2="200" y2="23" className="sz-d-tick" />
      <line x1="200" y1="19" x2="222" y2="19" className="sz-d-leader" />
      <text x="226" y="22" className="sz-d-label">Waist</text>

      <line x1="195" y1="28" x2="195" y2="150" className="sz-d-measure" />
      <line x1="191" y1="28" x2="199" y2="28" className="sz-d-tick" />
      <line x1="191" y1="150" x2="199" y2="150" className="sz-d-tick" />
      <line x1="195" y1="28" x2="222" y2="28" className="sz-d-leader" />
      <text x="226" y="31" className="sz-d-label">Outseam</text>

      <line x1="110" y1="28" x2="110" y2="150" className="sz-d-measure" />
      <line x1="106" y1="28" x2="114" y2="28" className="sz-d-tick" />
      <line x1="106" y1="150" x2="114" y2="150" className="sz-d-tick" />
      <text x="110" y="168" textAnchor="middle" className="sz-d-label">Inseam</text>
    </svg>
  );
}

function ShortsDiagram() {
  return (
    <svg viewBox="0 0 260 110" className="sizes-diagram-svg" aria-hidden="true">
      <rect x="60" y="10" width="140" height="18" rx="4" className="sz-d-outline" />
      <rect x="65" y="28" width="45" height="55" className="sz-d-outline" />
      <rect x="150" y="28" width="45" height="55" className="sz-d-outline" />

      <line x1="60" y1="19" x2="200" y2="19" className="sz-d-measure" />
      <line x1="60" y1="15" x2="60" y2="23" className="sz-d-tick" />
      <line x1="200" y1="15" x2="200" y2="23" className="sz-d-tick" />
      <line x1="200" y1="19" x2="222" y2="19" className="sz-d-leader" />
      <text x="226" y="22" className="sz-d-label">Waist</text>

      <line x1="195" y1="10" x2="195" y2="83" className="sz-d-measure" />
      <line x1="191" y1="10" x2="199" y2="10" className="sz-d-tick" />
      <line x1="191" y1="83" x2="199" y2="83" className="sz-d-tick" />
      <line x1="195" y1="46" x2="222" y2="46" className="sz-d-leader" />
      <text x="226" y="49" className="sz-d-label">Length</text>
    </svg>
  );
}

function ShoesDiagram() {
  return (
    <svg viewBox="0 0 220 260" className="sizes-diagram-svg" aria-hidden="true">
      <path d="M100,10 C130,10 145,40 148,80 C150,120 145,160 135,190 C128,215 118,230 100,235 C82,230 72,215 65,190 C55,160 50,120 52,80 C55,40 70,10 100,10 Z" className="sz-d-outline" />

      <line x1="100" y1="10" x2="100" y2="235" className="sz-d-measure" />
      <line x1="96" y1="10" x2="104" y2="10" className="sz-d-tick" />
      <line x1="96" y1="235" x2="104" y2="235" className="sz-d-tick" />
      <text x="100" y="252" textAnchor="middle" className="sz-d-label">Length</text>

      <line x1="52" y1="90" x2="148" y2="90" className="sz-d-measure" />
      <line x1="52" y1="86" x2="52" y2="94" className="sz-d-tick" />
      <line x1="148" y1="86" x2="148" y2="94" className="sz-d-tick" />
      <line x1="148" y1="90" x2="170" y2="90" className="sz-d-leader" />
      <text x="174" y="93" className="sz-d-label">Width</text>
    </svg>
  );
}

function BoxersDiagram() {
  return (
    <svg viewBox="0 0 260 140" className="sizes-diagram-svg" aria-hidden="true">
      <rect x="65" y="10" width="120" height="16" rx="4" className="sz-d-outline" />
      <path d="M65,26 L185,26 C185,55 178,80 160,95 L130,110 L125,118 L120,110 L90,95 C72,80 65,55 65,26 Z" className="sz-d-outline" />

      <line x1="65" y1="18" x2="185" y2="18" className="sz-d-measure" />
      <line x1="65" y1="14" x2="65" y2="22" className="sz-d-tick" />
      <line x1="185" y1="14" x2="185" y2="22" className="sz-d-tick" />
      <line x1="185" y1="18" x2="222" y2="18" className="sz-d-leader" />
      <text x="226" y="21" className="sz-d-label">Waist</text>

      <line x1="72" y1="60" x2="178" y2="60" className="sz-d-measure" />
      <line x1="72" y1="56" x2="72" y2="64" className="sz-d-tick" />
      <line x1="178" y1="56" x2="178" y2="64" className="sz-d-tick" />
      <line x1="178" y1="60" x2="222" y2="60" className="sz-d-leader" />
      <text x="226" y="63" className="sz-d-label">Hips</text>
    </svg>
  );
}

function GlassesDiagram() {
  return (
    <svg viewBox="0 0 340 160" className="sizes-diagram-svg" aria-hidden="true">
      <rect x="40" y="60" width="80" height="60" rx="20" className="sz-d-outline" />
      <rect x="180" y="60" width="80" height="60" rx="20" className="sz-d-outline" />
      <path d="M120,80 Q150,68 180,80" className="sz-d-outline" />
      <path d="M40,75 L15,70 L15,110" className="sz-d-outline" />
      <path d="M260,75 L285,70 L285,110" className="sz-d-outline" />

      <line x1="40" y1="30" x2="260" y2="30" className="sz-d-measure" />
      <line x1="40" y1="26" x2="40" y2="34" className="sz-d-tick" />
      <line x1="260" y1="26" x2="260" y2="34" className="sz-d-tick" />
      <text x="150" y="22" textAnchor="middle" className="sz-d-label">Frame width</text>

      <line x1="120" y1="76" x2="180" y2="76" className="sz-d-measure" />
      <line x1="120" y1="72" x2="120" y2="80" className="sz-d-tick" />
      <line x1="180" y1="72" x2="180" y2="80" className="sz-d-tick" />
      <text x="150" y="66" textAnchor="middle" className="sz-d-label">Bridge</text>

      <line x1="40" y1="128" x2="120" y2="128" className="sz-d-measure" />
      <line x1="40" y1="124" x2="40" y2="132" className="sz-d-tick" />
      <line x1="120" y1="124" x2="120" y2="132" className="sz-d-tick" />
      <text x="80" y="144" textAnchor="middle" className="sz-d-label">Lens width</text>

      <line x1="220" y1="60" x2="220" y2="120" className="sz-d-measure" />
      <line x1="216" y1="60" x2="224" y2="60" className="sz-d-tick" />
      <line x1="216" y1="120" x2="224" y2="120" className="sz-d-tick" />
      <line x1="224" y1="90" x2="266" y2="90" className="sz-d-leader" />
      <text x="270" y="93" className="sz-d-label">Lens height</text>

      <line x1="260" y1="75" x2="285" y2="110" className="sz-d-measure" />
      <text x="290" y="98" className="sz-d-label">Temple length</text>

      <circle cx="80" cy="90" r="2.5" className="sz-d-dot" />
      <circle cx="220" cy="90" r="2.5" className="sz-d-dot" />
      <line x1="80" y1="90" x2="220" y2="90" className="sz-d-measure" />
      <text x="150" y="102" textAnchor="middle" className="sz-d-label">PD</text>
    </svg>
  );
}

function PrescriptionDiagram() {
  return (
    <svg viewBox="0 0 220 210" className="sizes-diagram-svg" aria-hidden="true">
      <path d="M20,110 A90,90 0 0 1 200,110" className="sz-d-outline" />
      <line x1="10" y1="110" x2="210" y2="110" className="sz-d-outline" />
      <circle cx="110" cy="110" r="2.5" className="sz-d-dot" />

      <line x1="65" y1="188" x2="155" y2="32" className="sz-d-measure" />
      <circle cx="155" cy="32" r="2.5" className="sz-d-dot" />

      <text x="205" y="115" className="sz-d-label">0°</text>
      <text x="178" y="42" className="sz-d-label">45°</text>
      <text x="110" y="12" textAnchor="middle" className="sz-d-label">90°</text>
      <text x="42" y="42" textAnchor="end" className="sz-d-label">135°</text>
      <text x="15" y="115" textAnchor="end" className="sz-d-label">180°</text>

      <text x="110" y="205" textAnchor="middle" className="sz-d-label">Axis (0–180°) — the angle of your astigmatism correction</text>
    </svg>
  );
}

export const DIAGRAMS = {
  body: BodyDiagram,
  tshirt: TshirtDiagram,
  pants: PantsDiagram,
  shorts: ShortsDiagram,
  shoes: ShoesDiagram,
  boxers: BoxersDiagram,
  glasses: GlassesDiagram,
  prescription: PrescriptionDiagram,
};
