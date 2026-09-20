/**
 * Turns citation field values into the final citation string using the
 * user's template, and cleans up formatting artifacts (double commas,
 * stray leading spaces) left behind by blank fields like an empty %quals%.
 */
(function (global) {
  function buildCitation(template, data) {
    var map = {
      '%last%': data.last || '',
      '%first%': data.first || '',
      '%y%': data.year || '',
      '%date%': data.date || '',
      '%title%': data.title || '',
      '%publication%': data.publication || '',
      '%url%': data.url || '',
      '%quals%': data.quals || '',
      '%accessed%': data.accessed || ''
    };
    var result = template;
    Object.keys(map).forEach(function (key) {
      result = result.split(key).join(map[key]);
    });
    return cleanupCitation(result);
  }

  function cleanupCitation(result) {
    result = result.replace(/[ \t]+/g, ' ');
    result = result.replace(/\(\s+/g, '(');
    result = result.replace(/\s+\)/g, ')');
    result = result.replace(/\s+,/g, ',');
    // Collapse doubled/empty-field commas left behind by blank tokens
    // (e.g. an empty %quals% or %first%), without touching real commas.
    result = result.replace(/,(\s*,)+/g, ',');
    result = result.replace(/,\s*\)/g, ')');
    return result.trim();
  }

  global.CiteCreatorFormat = { buildCitation: buildCitation, cleanupCitation: cleanupCitation };
})(typeof window !== 'undefined' ? window : this);
