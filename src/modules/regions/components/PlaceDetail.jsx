import { Link } from 'react-router-dom';
import { X, Crosshair, Phone, ChevronRight, Building2 } from 'lucide-react';
import { useRepo } from '../../../core/db/repo';
import { contactFor, deptFromOwner } from '../lib/people';
import { REGIONS, unitById, islandIn, describe, inhabitedCount, industrialCount } from '../lib/regions';

/**
 * Who is responsible for the tapped place — the card this whole screen
 * exists to produce.
 *
 * The GM's name comes from the circular; the link under it comes from
 * Directory, matched by name at render time (see lib/people.js). So the card
 * answers "who covers Veymandoo" today, and will answer "what is his
 * extension" the day that person is entered in Directory, with nothing here
 * to change. An HOD or a unit head will slot into the same row.
 */
function PersonRow({ label, name }) {
  const repo = useRepo();
  const c = contactFor(repo, { name });
  const sub = [c.designation, c.ext && `ext ${c.ext}`].filter(Boolean).join(' · ');

  return (
    <div className="rgn-contact">
      <div className="eyebrow">{label}</div>
      {c.to ? (
        <Link className="rgn-contact-link" to={c.to}>
          <span><b>{name}</b>{sub && <small>{sub}</small>}</span>
          <ChevronRight size={15} />
        </Link>
      ) : (
        <div className="rgn-contact-plain">
          <b>{name}</b>
          <small>Not in Directory yet</small>
        </div>
      )}
      {c.mobile && (
        <a className="rgn-phone" href={`tel:${String(c.mobile).replace(/\s+/g, '')}`}>
          <Phone size={13} /> {c.mobile}
        </a>
      )}
    </div>
  );
}

/**
 * Whoever runs a place outside the four regions. Malé's and Hulhumalé's power
 * generation departments are STELCO departments whose staff are (or will be)
 * in Directory; Hulhulé is MACL's and never will be, so only a real
 * department offers the link.
 */
function OwnerRow({ label, owner }) {
  const repo = useRepo();
  const dept = deptFromOwner(owner);
  const { staffCount } = contactFor(repo, { dept });

  return (
    <div className="rgn-contact">
      <div className="eyebrow">{label}</div>
      {dept && staffCount > 0 ? (
        <Link className="rgn-contact-link" to="/directory">
          <span><b>{dept}</b><small>{staffCount} in Directory</small></span>
          <ChevronRight size={15} />
        </Link>
      ) : (
        <div className="rgn-contact-plain">
          <b>{owner || 'Not assigned'}</b>
          {dept && <small>No staff in Directory yet</small>}
        </div>
      )}
    </div>
  );
}

export function PlaceDetail({ selected, onClose, onZoom }) {
  const u = unitById(selected.unitId);
  if (!u) return null;
  const island = selected.island ? islandIn(u, selected.island) : null;
  const d = describe(u, island);
  const region = u.reg ? REGIONS[u.reg] : null;

  return (
    <div className="rgn-detail" style={{ '--c': d.color }}>
      <button type="button" className="rgn-close" onClick={onClose} aria-label="Close">
        <X size={14} />
      </button>

      <h3>{island ? island.n : u.name}</h3>
      {island && island.dv && <div className="rgn-dv">{island.dv}</div>}
      <div className="rgn-sub">
        {island
          ? [d.isCapital && 'Atoll capital', d.type, u.reg && `${u.name} (${u.code})`].filter(Boolean).join(' · ')
          : `${u.geo} · ${inhabitedCount(u)} inhabited${industrialCount(u) ? ` + ${industrialCount(u)} industrial` : ''}`}
      </div>

      <div className="rgn-tag">
        {region ? `Region ${u.reg} · ${region.name}` : 'Outside the regional departments'}
      </div>

      {region
        ? <PersonRow label="General Manager" name={region.gm} />
        : <OwnerRow label="Managed by" owner={d.managedBy} />}

      {!region && !deptFromOwner(d.managedBy) && (
        <div className="rgn-note-inline"><Building2 size={13} /> Not a STELCO department</div>
      )}

      <div className="rgn-drow">
        <span className="k">Position</span>
        <span className="mono">{d.lat.toFixed(4)}°, {d.lon.toFixed(4)}°</span>
      </div>

      <button type="button" className="rgn-zoom" onClick={onZoom}>
        <Crosshair size={14} /> {island ? 'Zoom to island' : 'Zoom to atoll'}
      </button>
    </div>
  );
}
