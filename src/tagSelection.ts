export function selectActiveTag(
  selected: string,
  tags: { TagKey: string; Status: string }[],
): string {
  const active = tags.filter((tag) => tag.Status === "Active");
  return active.some((tag) => tag.TagKey === selected)
    ? selected
    : active[0]?.TagKey || "";
}
