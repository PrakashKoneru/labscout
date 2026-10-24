export const NYC_INSTITUTIONS: Record<string, string> = {
  "https://openalex.org/I78577930": "Columbia",
  "https://openalex.org/I57206974": "NYU",
  "https://openalex.org/I205783295": "Cornell",
  "https://openalex.org/I4405261073": "Cornell Tech",
};

export const INSTITUTION_FILTER = Object.keys(NYC_INSTITUTIONS)
  .map((u) => u.replace("https://openalex.org/", ""))
  .join("|");
