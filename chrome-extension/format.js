/**
 * Turns citation field values into the final cite string using the chosen
 * format, and cleans up artifacts (double commas, stray spaces) left behind
 * by blank fields like a missing %quals%.
 */
(function (global) {
  var PRESETS = {
    standard: '%first% %last%, %quals%, %date%, "%title%," %publication%, %url%',
    frontloaded: '%first% %last% %y%, %quals%, %date%, "%title%," %publication%, %url%',
    twoline: '%last% %y%%linebreak%(%first% %last% %y%, %quals%, %date%, "%title%," %publication%, %url%)'
  };

  var DEFAULT_CUSTOM =
    '%last% %y% --- (%first% %last%, %date%, "%title%", %publication%, %url%, %quals%, doa%accessed%) //jx';

  function templateFor(mode, customTemplate) {
    if (mode && PRESETS[mode]) return PRESETS[mode];
    return customTemplate || DEFAULT_CUSTOM;
  }

  function buildCitation(template, data) {
    var author = ((data.first || '') + ' ' + (data.last || '')).trim();
    var map = {
      '%author%': author,
      '%last%': data.last || '',
      '%first%': data.first || '',
      '%y%': data.year || '',
      '%date%': data.date || '',
      '%title%': data.title || '',
      '%publication%': data.publication || '',
      '%url%': data.url || '',
      '%quals%': data.quals || '',
      '%accessed%': data.accessed || '',
      '%linebreak%': '\n'
    };
    var result = template;
    Object.keys(map).forEach(function (key) {
      result = result.split(key).join(map[key]);
    });
    return cleanupCitation(result);
  }

  function cleanupCitation(result) {
    // Clean each line separately so %linebreak% output isn't collapsed.
    return result
      .split('\n')
      .map(function (line) {
        line = line.replace(/[ \t]+/g, ' ');
        line = line.replace(/\(\s+/g, '(');
        line = line.replace(/\s+\)/g, ')');
        line = line.replace(/[ \t]+,/g, ',');
        // Collapse doubled/empty-field commas left behind by blank tokens
        // (e.g. an empty %quals%), without touching real commas.
        line = line.replace(/,([ \t]*,)+/g, ',');
        line = line.replace(/,[ \t]*\)/g, ')');
        line = line.replace(/,[ \t]*$/, '');
        return line.trim();
      })
      .join('\n')
      .trim();
  }

  global.CiteCreatorFormat = {
    buildCitation: buildCitation,
    cleanupCitation: cleanupCitation,
    templateFor: templateFor,
    PRESETS: PRESETS,
    DEFAULT_CUSTOM: DEFAULT_CUSTOM
  };
})(typeof window !== 'undefined' ? window : this);
