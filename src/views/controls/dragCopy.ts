// Alt+drag copies (Decision "Alt+drag copies"; the user: "for every element that can be dragged … drag + Alt copies
// it"): what a drag would move is copied where it is dropped, and the original stays. On the plan it is Alt; in the
// panels' rows (the browser's own drag and drop) Ctrl copies too, as the system's own drags do on Windows.

/** Does this panel drop copy? (Alt, or Ctrl) */
export const copyDrop = (e: { altKey: boolean; ctrlKey: boolean }): boolean => e.altKey || e.ctrlKey
