/** A template name from an SVG file name: no ".svg", dashes and underscores become spaces, all lowercase except the first letter ("Gable box with window"). */
export function templateNameFromFile(fileName: string): string {
  const words = fileName.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
