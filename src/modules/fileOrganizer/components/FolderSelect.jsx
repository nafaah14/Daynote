import { Select } from '../../../core/ui/components';
import { childFolders } from '../lib/helpers';

/** A <select> listing every folder, indented by depth, plus "All Files"
 *  for the root. `value`/`onChange` work in folderId (null = root). */
export default function FolderSelect({ folders, value, onChange }) {
  const options = [];
  const walk = (parentId, depth) => {
    childFolders(folders, parentId).forEach((f) => {
      options.push({ id: f.id, label: `${'— '.repeat(depth)}${f.name}` });
      walk(f.id, depth + 1);
    });
  };
  walk(null, 0);

  return (
    <Select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">All Files (root)</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </Select>
  );
}
