/**
 * Unit catalogue and conversion. Every category has a base unit; each unit's
 * `f` is how many base units it holds, so converting is value * from.f / to.f.
 * Temperature is the one category that isn't a pure ratio, so its units carry
 * explicit to/from-base functions instead.
 */

const u = (id, name, symbol, f) => ({ id, name, symbol, f });

export const CATEGORIES = [
  {
    id: 'length', label: 'Length', def: ['m', 'ft'],
    units: [
      u('mm', 'Millimetre', 'mm', 0.001), u('cm', 'Centimetre', 'cm', 0.01), u('m', 'Metre', 'm', 1),
      u('km', 'Kilometre', 'km', 1000), u('in', 'Inch', 'in', 0.0254), u('ft', 'Foot', 'ft', 0.3048),
      u('yd', 'Yard', 'yd', 0.9144), u('mi', 'Mile', 'mi', 1609.344), u('nmi', 'Nautical mile', 'nmi', 1852),
    ],
  },
  {
    id: 'weight', label: 'Weight', def: ['kg', 'lb'],
    units: [
      u('mg', 'Milligram', 'mg', 1e-6), u('g', 'Gram', 'g', 0.001), u('kg', 'Kilogram', 'kg', 1),
      u('t', 'Tonne', 't', 1000), u('oz', 'Ounce', 'oz', 0.028349523125), u('lb', 'Pound', 'lb', 0.45359237),
      u('st', 'Stone', 'st', 6.35029318),
    ],
  },
  {
    id: 'volume', label: 'Volume', def: ['L', 'gal'],
    units: [
      u('mL', 'Millilitre', 'mL', 0.001), u('L', 'Litre', 'L', 1), u('m3', 'Cubic metre', 'm³', 1000),
      u('tsp', 'Teaspoon (US)', 'tsp', 0.00492892159375), u('tbsp', 'Tablespoon (US)', 'tbsp', 0.01478676478125),
      u('floz', 'Fluid ounce (US)', 'fl oz', 0.0295735295625), u('cup', 'Cup (US)', 'cup', 0.2365882365),
      u('pt', 'Pint (US)', 'pt', 0.473176473), u('qt', 'Quart (US)', 'qt', 0.946352946),
      u('gal', 'Gallon (US)', 'gal', 3.785411784), u('galuk', 'Gallon (UK)', 'gal UK', 4.54609),
    ],
  },
  {
    id: 'area', label: 'Area', def: ['m2', 'ft2'],
    units: [
      u('cm2', 'Square centimetre', 'cm²', 0.0001), u('m2', 'Square metre', 'm²', 1),
      u('ha', 'Hectare', 'ha', 10000), u('km2', 'Square kilometre', 'km²', 1e6),
      u('in2', 'Square inch', 'in²', 0.00064516), u('ft2', 'Square foot', 'ft²', 0.09290304),
      u('ac', 'Acre', 'ac', 4046.8564224), u('mi2', 'Square mile', 'mi²', 2589988.110336),
    ],
  },
  {
    id: 'temperature', label: 'Temperature', def: ['C', 'F'],
    units: [
      { id: 'C', name: 'Celsius', symbol: '°C', toBase: (v) => v, fromBase: (v) => v },
      { id: 'F', name: 'Fahrenheit', symbol: '°F', toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
      { id: 'K', name: 'Kelvin', symbol: 'K', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    ],
  },
  {
    id: 'speed', label: 'Speed', def: ['kmh', 'mph'],
    units: [
      u('ms', 'Metre / second', 'm/s', 1), u('kmh', 'Kilometre / hour', 'km/h', 1 / 3.6),
      u('mph', 'Mile / hour', 'mph', 0.44704), u('kn', 'Knot', 'kn', 1852 / 3600),
    ],
  },
  {
    id: 'time', label: 'Time', def: ['h', 'min'],
    units: [
      u('ms', 'Millisecond', 'ms', 0.001), u('s', 'Second', 's', 1), u('min', 'Minute', 'min', 60),
      u('h', 'Hour', 'h', 3600), u('d', 'Day', 'd', 86400), u('wk', 'Week', 'wk', 604800),
      u('mo', 'Month (30.44 d)', 'mo', 2629746), u('yr', 'Year (365.25 d)', 'yr', 31557600),
    ],
  },
  {
    id: 'data', label: 'Data', def: ['MB', 'GB'],
    units: [
      u('B', 'Byte', 'B', 1), u('KB', 'Kilobyte', 'KB', 1e3), u('MB', 'Megabyte', 'MB', 1e6),
      u('GB', 'Gigabyte', 'GB', 1e9), u('TB', 'Terabyte', 'TB', 1e12),
      u('KiB', 'Kibibyte', 'KiB', 1024), u('MiB', 'Mebibyte', 'MiB', 1048576),
      u('GiB', 'Gibibyte', 'GiB', 1073741824), u('TiB', 'Tebibyte', 'TiB', 1099511627776),
    ],
  },
  {
    id: 'pressure', label: 'Pressure', def: ['bar', 'psi'],
    units: [
      u('Pa', 'Pascal', 'Pa', 1), u('kPa', 'Kilopascal', 'kPa', 1000), u('bar', 'Bar', 'bar', 1e5),
      u('psi', 'PSI', 'psi', 6894.757293168), u('atm', 'Atmosphere', 'atm', 101325),
      u('mmHg', 'mmHg', 'mmHg', 133.322387415),
    ],
  },
  {
    id: 'power', label: 'Power', def: ['kW', 'hp'],
    units: [
      u('W', 'Watt', 'W', 1), u('kW', 'Kilowatt', 'kW', 1000), u('MW', 'Megawatt', 'MW', 1e6),
      u('hp', 'Horsepower (mech.)', 'hp', 745.69987158227),
      u('PS', 'Horsepower (metric)', 'PS', 735.49875), u('btuh', 'BTU / hour', 'BTU/h', 0.29307107),
      u('TR', 'Ton of refrigeration', 'TR', 3516.8528),
    ],
  },
  {
    id: 'energy', label: 'Energy', def: ['kWh', 'MJ'],
    units: [
      u('J', 'Joule', 'J', 1), u('kJ', 'Kilojoule', 'kJ', 1000), u('MJ', 'Megajoule', 'MJ', 1e6),
      u('Wh', 'Watt-hour', 'Wh', 3600), u('kWh', 'Kilowatt-hour', 'kWh', 3.6e6),
      u('cal', 'Calorie', 'cal', 4.184), u('kcal', 'Kilocalorie', 'kcal', 4184),
      u('btu', 'BTU', 'BTU', 1055.05585262),
    ],
  },
];

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || null;

export function unitOf(cat, unitId) {
  return cat.units.find((x) => x.id === unitId) || null;
}

/** Convert `value` between two units of one category. NaN if either unit is unknown. */
export function convert(value, cat, fromId, toId) {
  const from = unitOf(cat, fromId);
  const to = unitOf(cat, toId);
  if (!from || !to || !Number.isFinite(value)) return NaN;
  if (from.toBase) return to.fromBase(from.toBase(value));
  return (value * from.f) / to.f;
}
