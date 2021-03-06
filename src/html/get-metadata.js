/*
 * Copyright 2018 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
const { select, selectAll } = require('unist-util-select');
const plain = require('mdast-util-to-string');
const { flat, obj, map } = require('@adobe/helix-shared').sequence;


function yaml(section) {
  const yamls = selectAll('yaml', section);
  /* eslint-disable-next-line no-param-reassign */
  section.meta = obj(flat(map(yamls, ({ payload }) => payload)));
  return section;
}

function title(section) {
  const header = select('heading', section);
  return header ? Object.assign({ title: plain(header) }, section) : section;
}

function intro(section) {
  const para = selectAll('paragraph', section).filter((p) => {
    if ((p.children.length === 0)
        || (p.children.length === 1 && p.children[0].type === 'image')) {
      return false;
    }
    return true;
  })[0];
  return para ? Object.assign({ intro: plain(para) }, section) : section;
}

function image(section) {
  // selects the most prominent image of the section
  // TODO: get a better measure of prominence than "first"
  const img = select('image', section);
  return img ? Object.assign({ image: img.url }, section) : section;
}

/**
 * Construct the strings corresponding to the number of occurences per type.
 * @param {Object} typecounter Type as a key, number of occurences as value
 */
function constructTypes(typecounter) {
  const types = Object.keys(typecounter).map(type => `has-${type}`); // has-{type}
  types.push(...Object.keys(typecounter).map(type => `nb-${type}-${typecounter[type]}`)); // nb-{type}-{nb-occurences}
  if (Object.keys(typecounter).length === 1) {
    types.push(`has-only-${Object.keys(typecounter)[0]}`);
  } else {
    types.push(...Object.entries(typecounter) // get pairs of type, count
      .sort((left, right) => left[1] < right[1]) // sort descending by count
      .slice(0, 3) // take the top three
      .map(([name]) => name) // keep only the type
      .reduce((names, name) => [`${names[0] || 'is'}-${name}`, ...names], [])); // generate names
  }
  return types;
}

/**
 * Sets the `types` attribute of the section, using following patterns:
 * 1. has-<type> for every type of content found in the section
 * 2. is-<type>-only for sections that have only content of type
 * 3. is-<type1>-<type2>-<type3> ranks the top three most common types of content
 * 4. nb-<type>-<nb_occurences> is the number of occurences per type
 * @param {*} section
 */
function sectiontype(section) {
  const children = section.children || [];

  function reducer(counter, node) {
    const { type, children: pChildren } = node;

    // eslint-disable-next-line no-param-reassign
    node.data = Object.assign({ types: [] }, node.data);

    if (type === 'yaml') {
      return counter;
    }

    const mycounter = {};

    if (type === 'paragraph' && pChildren && pChildren.length > 0) {
      // if child is a paragraph, check its children, it might contain an image or a list
      // which are always wrapped by default.
      pChildren.forEach((p) => {
        let prefix = 'has';
        if (p.type === 'text') {
          // do not count "empty" paragraphs
          if (p.value === '\n' || p.value === '') return;

          // paragraph with type text "is" a text
          prefix = 'is';
        }
        if (!node.data.types.includes(`${prefix}-${p.type}`)) {
          node.data.types.push(`${prefix}-${p.type}`);
        }
        const mycount = mycounter[p.type] || 0;
        mycounter[p.type] = mycount + 1;
      });
    }

    if (type === 'list' && pChildren && pChildren.length > 0) {
      // if list, analyze the children of its children (listitems)
      let listtypecounter = {};
      pChildren.forEach((listitem) => {
        listtypecounter = listitem.children.reduce(reducer, listtypecounter);
      });
      constructTypes(listtypecounter).forEach(item => node.data.types.push(item));
    }

    if (Object.keys(mycounter).length === 0) {
      // was really a paragraph, only text inside
      const mycount = mycounter[type] || 0;
      mycounter[type] = mycount + 1;
      node.data.types.push(`is-${type}`);
    }

    Object.keys(counter).forEach((key) => {
      mycounter[key] = counter[key] + (mycounter[key] || 0);
    });
    return mycounter;
  }

  const typecounter = children.reduce(reducer, {});

  const types = constructTypes(typecounter);

  return Object.assign({ types }, section);
}

function fallback(section) {
  if (section.intro && !section.title) {
    return Object.assign({ title: section.intro }, section);
  } else if (section.title && !section.intro) {
    return Object.assign({ intro: section.title }, section);
  }
  return section;
}

function getmetadata({ content: { sections = [] } }, { logger }) {
  logger.debug(`Parsing Markdown Metadata from ${sections.length} sections`);

  const retsections = sections
    .map(yaml)
    .map(title)
    .map(intro)
    .map(image)
    .map(sectiontype)
    .map(fallback);
  const img = retsections.filter(section => section.image)[0];
  if (retsections[0]) {
    const retcontent = {
      sections: retsections,
      meta: retsections[0].meta,
      title: retsections[0].title,
      intro: retsections[0].intro,
      image: img ? img.image : undefined,
    };
    return { content: retcontent };
  }
  return { content: { meta: {} } };
}

module.exports = getmetadata;
