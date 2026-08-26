// Client-side navigation to any route this slot doesn't otherwise match
// (e.g. clicking "Admin" or "+ New Task" while the modal is open) resolves
// here and renders nothing, so the modal doesn't stay stuck open.
export default function CatchAll() {
  return null;
}
