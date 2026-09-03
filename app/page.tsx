import styles from "@/app/page.module.css";

export default function Page() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Today</h1>
      <p className={styles.note}>The ranked day arrives in Phase 3.</p>
    </div>
  );
}
