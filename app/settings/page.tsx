// Owns: the Settings page (PROJECT.md §11.1). Still mostly the stub Phase 1 left: editing arrives
// in Phase 10. The one live section is API keys, brought forward because §17 lists it as part of
// Phase 5 — without somewhere to put a key, nothing the composer does can be run at all.

import ApiKeys from "@/components/settings/ApiKeys";
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
  "History",
  "Sync",
];

export default function Page() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>

      <ApiKeys />

      <p className={styles.note}>
        The rest of Settings arrives in Phase 10. Current values are readable now at{" "}
        <code>/api/settings</code>.
      </p>
      <ul className={styles.sections}>
        {SECTIONS.map((section) => (
          <li key={section}>{section}</li>
        ))}
      </ul>
    </div>
  );
}
