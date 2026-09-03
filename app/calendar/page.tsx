import styles from "@/app/page.module.css";

export default function Page() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Calendar</h1>
      <p className={styles.note}>Rolling, month, and week views arrive in Phase 4.</p>
    </div>
  );
}
