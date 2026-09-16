// Owns: a document's frontmatter as a table (PROJECT.md §10.2) — one row per key, in the file's order.
// Read-only until B2 makes each value editable; the shapes it shows are the ones the editor will take
// back, so arrays read as comma-separated and booleans as yes or no.
//
// Failure behavior: none. A value it has no better form for is shown as JSON, never dropped.

import styles from "./Browser.module.css";

function shown(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map((one) => (typeof one === "object" ? JSON.stringify(one) : String(one))).join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function FrontmatterTable({ fields }: { fields: Record<string, unknown> }) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;
  return (
    <table className={styles.frontmatter} data-ui="frontmatter">
      <tbody>
        {keys.map((key) => (
          <tr key={key} data-field={key}>
            <th scope="row">{key}</th>
            <td>{shown(fields[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
