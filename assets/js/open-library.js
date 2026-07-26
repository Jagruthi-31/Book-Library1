// ════════════════════════════════════════════════════════════════════════
// OPEN LIBRARY — search-to-autofill, same endpoint V1 used.
// Pure API access here; book-form.js owns the search-box UI and debouncing.
// ════════════════════════════════════════════════════════════════════════

export async function searchOpenLibrary(query) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=6&fields=title,author_name,number_of_pages_median,cover_i,first_publish_year`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library returned ${res.status}`);
  const data = await res.json();
  return data.docs || [];
}

export function coverThumbUrl(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-S.jpg` : null;
}
export function coverMediumUrl(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
}
