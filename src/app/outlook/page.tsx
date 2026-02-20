import { OutlookBoardShell } from "@/components/outlook/OutlookBoardShell";

// No thread prop → shell falls back to DUMMY_THREAD for browser development.
// For the real Outlook add-in task pane, see /outlook/addin.
export default function OutlookPage() {
  return <OutlookBoardShell />;
}
