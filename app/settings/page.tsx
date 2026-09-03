import styles from "@/app/page.module.css";

const SECTIONS = [
  "Identity",
  "Timezone",
  "Weather",
  "Theme",
  "Day shape",
  "List behavior",
  "Categories",
  "First day of week",
  "Models",
  "API keys",
  "History",
  "Sync",
];

export default function Page() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.note}>
        Editing arrives in Phase 10. Current values are readable now at <code>/api/settings</code>.
      </p>
      <ul className={styles.sections}>
        {SECTIONS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
