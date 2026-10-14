// Owns: Settings' server-loaded initial values and existing key editor (§11.1).
// Failure behavior: settings recovery stays in the store; client refusals remain beside each section.
import ApiKeys from "@/components/settings/ApiKeys";
import SettingsForm from "@/components/settings/SettingsForm";
import { readSettings } from "@/lib/store/settings";
import styles from "@/app/page.module.css";
export const dynamic = "force-dynamic";
export default async function Page() {
  return <div className={styles.page}><h1 className={styles.title}>Settings</h1><SettingsForm initial={await readSettings()} /><ApiKeys /></div>;
}
