import { describe, expect, it } from 'vitest';
import { rowsFromSidPage, htmlFromSaved } from '../sidPage';

/* Markup copied from a saved SID 2.0 page; the people are made up. */
const row = (name, sid, dept, { ext = '0', head = false, initials = 'AB' } = {}) => `<tr>
  <td><span class="star " title="Pin staff">★</span></td>
  <td>
    <span class="avatar-wrap ${head ? 'resp-unit' : ''}" title="${head ? 'Unit Head' : ''}">
      <span class="avatar" style="background:hsl(1,70%,50%)">
        ${initials}
      </span>
    </span>
    ${name}
  </td>
  <td class="cola-c">${sid}</td>
  <td class="cola-l">Technician</td>
  <td class="cola-l">${dept}</td>
  <td class="cola-l">Mechanical Services Unit (L)</td>
  <td class="cola-c"><a class="url-ext-no" href="tel:3338143">3338143</a></td>
  <td class="cola-c">${ext}</td>
  <td class="cola-c"><span class="masked-mobile" title="Please Login">7••••••</span></td>
</tr>`;

const page = (...rows) => `<html><body><table><thead><tr>
  <th>Action</th><th>Name</th><th>StaffID</th><th>Job</th><th>Dept</th><th>Unit</th><th>DIDNo</th><th>EXTNo</th><th>Mobile</th>
</tr></thead><tbody>${rows.join('')}</tbody></table></body></html>`;

describe('rowsFromSidPage', () => {
  it('reads whole departments, leaves out initials and the masked mobile', () => {
    const { rows } = rowsFromSidPage(page(
      row('Ali Hassan', '150169', 'Hulhumale&#39; Power Generation Department', { ext: '8143' }),
      row('Mohamed Mahil', '230137', "Hulhumale' Power Generation Department", { head: true, initials: 'MM' }),
    ));
    expect(rows).toEqual([
      { sid: '150169', name: 'Ali Hassan', designation: 'Technician', dept: "Hulhumale' Power Generation Department", unit: 'Mechanical Services Unit (L)', ext: '8143', isUnitHead: false },
      { sid: '230137', name: 'Mohamed Mahil', designation: 'Technician', dept: "Hulhumale' Power Generation Department", unit: 'Mechanical Services Unit (L)', ext: '', isUnitHead: true },
    ]);
  });

  it('keeps the last copy of a repeated staff ID', () => {
    const { rows } = rowsFromSidPage(page(row('Old Name', '1', 'A'), row('New Name', '1', 'A')));
    expect(rows.map((r) => r.name)).toEqual(['New Name']);
  });

  it('refuses a page without the staff table', () => {
    expect(() => rowsFromSidPage('<html><table><tr><td>x</td></tr></table></html>')).toThrow(/SID 2.0/);
  });
});

describe('htmlFromSaved', () => {
  it('unpacks the page from a quoted-printable .mhtml', () => {
    const mhtml = [
      'From: <Saved by Blink>',
      'Content-Type: multipart/related;',
      '\ttype="text/html";',
      '\tboundary="----B--x----"',
      '',
      '------B--x----',
      'Content-Type: text/html',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<td class=3D"cola-l">Hulhumale\' Power Gene=',
      'ration Department</td><td>=E2=98=85</td>',
      '------B--x------',
    ].join('\r\n');
    expect(htmlFromSaved(mhtml)).toContain('<td class="cola-l">Hulhumale\' Power Generation Department</td><td>★</td>');
  });

  it('passes plain HTML through', () => {
    expect(htmlFromSaved('<html></html>')).toBe('<html></html>');
  });
});
