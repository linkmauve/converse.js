// Converse.js (A browser based XMPP chat client)
// http://conversejs.org
//
// This is the utilities module.
//
// Copyright (c) 2012-2017, Jan-Carel Brand <jc@opkode.com>
// Licensed under the Mozilla Public License (MPLv2)
//
/*global define, escape, window */
(function (root, factory) {
    define([
        "sizzle",
        "es6-promise",
        "jquery.browser",
        "lodash.noconflict",
        "strophe",
    ], factory);
}(this, function (
        sizzle,
        Promise,
        jQBrowser,
        _,
        Strophe
    ) {
    "use strict";
    const b64_sha1 = Strophe.SHA1.b64_sha1;
    Strophe = Strophe.Strophe;

    const URL_REGEX = /\b(https?:\/\/|www\.|https?:\/\/www\.)[^\s<>]{2,200}\b/g;

    const logger = _.assign({
        'debug': _.get(console, 'log') ? console.log.bind(console) : _.noop,
        'error': _.get(console, 'log') ? console.log.bind(console) : _.noop,
        'info': _.get(console, 'log') ? console.log.bind(console) : _.noop,
        'warn': _.get(console, 'log') ? console.log.bind(console) : _.noop
    }, console);

    var unescapeHTML = function (htmlEscapedText) {
        /* Helper method that replace HTML-escaped symbols with equivalent characters
         * (e.g. transform occurrences of '&amp;' to '&')
         *
         * Parameters:
         *  (String) htmlEscapedText: a String containing the HTML-escaped symbols.
         */
        var div = document.createElement('div');
        div.innerHTML = htmlEscapedText;
        return div.innerText;
    };

    var isImage = function (url) {
        return new Promise((resolve, reject) => {
            var img = new Image();
            var timer = window.setTimeout(function () {
                reject(new Error("Could not determine whether it's an image"));
                img = null;
            }, 3000);
            img.onerror = img.onabort = function () {
                clearTimeout(timer);
                reject(new Error("Could not determine whether it's an image"));
            };
            img.onload = function () {
                clearTimeout(timer);
                resolve(img);
            };
            img.src = url;
        });
    };

    function calculateElementHeight (el) {
        /* Return the height of the passed in DOM element,
         * based on the heights of its children.
         */
        return _.reduce(
            el.children,
            (result, child) => result + child.offsetHeight, 0
        );
    }

    function slideOutWrapup (el) {
        /* Wrapup function for slideOut. */
        el.removeAttribute('data-slider-marker');
        el.classList.remove('collapsed');
        el.style.overflow = "";
        el.style.height = "";
    }


    var u = {};

    u.removeElement = function (el) {
        if (!_.isNil(el) && !_.isNil(el.parentNode)) {
            el.parentNode.removeChild(el);
        }
    }

    u.showElement = function (el) {
        if (!_.isNil(el)) {
            el.classList.remove('collapsed');
            el.classList.remove('hidden');
        }
    }

    u.hideElement = function (el) {
        if (!_.isNil(el)) {
            el.classList.add('hidden');
        }
    }

    u.nextUntil = function (el, selector, include_self=false) {
        /* Return the element's siblings until one matches the selector. */
        const matches = [];
        let sibling_el = el.nextElementSibling;
        while (!_.isNil(sibling_el) && !sibling_el.matches(selector)) {
            matches.push(sibling_el);
            sibling_el = sibling_el.nextElementSibling;
        }
        return matches;
    }

    u.addHyperlinks = function (text) {
        const list = text.match(URL_REGEX) || [];
        var links = [];
        _.each(list, (match) => {
            const prot = match.indexOf('http://') === 0 || match.indexOf('https://') === 0 ? '' : 'http://';
            const url = prot + encodeURI(decodeURI(match)).replace(/[!'()]/g, escape).replace(/\*/g, "%2A");
            const  a = '<a target="_blank" rel="noopener" href="' + url + '">'+ _.escape(match) + '</a>';
            // We first insert a hash of the code that will be inserted, and
            // then later replace that with the code itself. That way we avoid
            // issues when some matches are substrings of others.
            links.push(a);
            text = text.replace(match, b64_sha1(a));
        });
        while (links.length) {
            const a = links.pop();
            text = text.replace(b64_sha1(a), a);
        }
        return text;
    };

    u.renderImageURLs = function (obj) {
        const list = obj.textContent.match(URL_REGEX) || [];
        _.forEach(list, function (url) {
            isImage(url).then(function (img) {
                img.className = 'chat-image';
                var anchors = sizzle(`a[href="${url}"]`, obj);
                _.each(anchors, (a) => { a.innerHTML = img.outerHTML; });
            });
        });
        return obj;
    };

    u.slideInAllElements = function (elements, duration=600) {
        return Promise.all(
            _.map(
                elements,
                _.partial(u.slideIn, _, duration)
            ));
    };

    u.slideToggleElement = function (el) {
        if (_.includes(el.classList, 'collapsed')) {
            return u.slideOut(el);
        } else {
            return u.slideIn(el);
        }
    };

    u.hasClass = function (el, className) {
        return _.includes(el.classList, className);
    };

    u.slideOut = function (el, duration=250) {
        /* Shows/expands an element by sliding it out of itself
         *
         * Parameters:
         *      (HTMLElement) el - The HTML string
         *      (Number) duration - The duration amount in milliseconds
         */
        return new Promise((resolve, reject) => {
            if (_.isNil(el)) {
                const err = "Undefined or null element passed into slideOut"
                logger.warn(err);
                reject(new Error(err));
                return;
            }
            const marker = el.getAttribute('data-slider-marker');
            if (marker) {
                el.removeAttribute('data-slider-marker');
                window.cancelAnimationFrame(marker);
            }
            const end_height = calculateElementHeight(el);
            if (window.converse_disable_effects) { // Effects are disabled (for tests)
                el.style.height = end_height + 'px';
                slideOutWrapup(el);
                resolve();
                return;
            }
            if (!u.hasClass(el, 'collapsed') && !u.hasClass(el, 'hidden')) {
                resolve();
                return;
            }

            const steps = duration/17; // We assume 17ms per animation which is ~60FPS
            let height = 0;

            function draw () {
                height += end_height/steps;
                if (height < end_height) {
                    el.style.height = height + 'px';
                    el.setAttribute(
                        'data-slider-marker',
                        window.requestAnimationFrame(draw)
                    );
                } else {
                    // We recalculate the height to work around an apparent
                    // browser bug where browsers don't know the correct
                    // offsetHeight beforehand.
                    el.removeAttribute('data-slider-marker');
                    el.style.height = calculateElementHeight(el) + 'px';
                    el.style.overflow = "";
                    el.style.height = "";
                    resolve();
                }
            }
            el.style.height = '0';
            el.style.overflow = 'hidden';
            el.classList.remove('hidden');
            el.classList.remove('collapsed');
            el.setAttribute(
                'data-slider-marker',
                window.requestAnimationFrame(draw)
            );
        });
    };

    u.slideIn = function (el, duration=250) {
        /* Hides/collapses an element by sliding it into itself. */
        return new Promise((resolve, reject) => {
            if (_.isNil(el)) {
                const err = "Undefined or null element passed into slideIn";
                logger.warn(err);
                return reject(new Error(err));
            } else if (_.includes(el.classList, 'collapsed')) {
                return resolve();
            } else if (window.converse_disable_effects) { // Effects are disabled (for tests)
                el.classList.add('collapsed');
                el.style.height = "";
                return resolve();
            }
            const marker = el.getAttribute('data-slider-marker');
            if (marker) {
                el.removeAttribute('data-slider-marker');
                window.cancelAnimationFrame(marker);
            }
            const original_height = el.offsetHeight,
                 steps = duration/17; // We assume 17ms per animation which is ~60FPS
            let height = original_height;

            el.style.overflow = 'hidden';

            function draw () { 
                height -= original_height/steps;
                if (height > 0) {
                    el.style.height = height + 'px';
                    el.setAttribute(
                        'data-slider-marker',
                        window.requestAnimationFrame(draw)
                    );
                } else {
                    el.removeAttribute('data-slider-marker');
                    el.classList.add('collapsed');
                    el.style.height = "";
                    resolve();
                }
            }
            el.setAttribute(
                'data-slider-marker',
                window.requestAnimationFrame(draw)
            );
        });
    };

    function afterAnimationEnds (el, callback) {
        el.classList.remove('visible');
        if (_.isFunction(callback)) {
            callback();
        }
    }

    u.fadeIn = function (el, callback) {
        if (_.isNil(el)) {
            logger.warn("Undefined or null element passed into fadeIn");
        }
        if (window.converse_disable_effects) {
            el.classList.remove('hidden');
            return afterAnimationEnds(el, callback);
        }
        if (_.includes(el.classList, 'hidden')) {
            el.classList.add('visible');
            el.classList.remove('hidden');
            el.addEventListener("webkitAnimationEnd", _.partial(afterAnimationEnds, el, callback));
            el.addEventListener("animationend", _.partial(afterAnimationEnds, el, callback));
            el.addEventListener("oanimationend", _.partial(afterAnimationEnds, el, callback));
        } else {
            afterAnimationEnds(el, callback);
        }
    };

    u.isValidJID = function (jid) {
        return _.filter(jid.split('@')).length === 2 && !jid.startsWith('@') && !jid.endsWith('@');
    };

    u.isSameBareJID = function (jid1, jid2) {
        return Strophe.getBareJidFromJid(jid1).toLowerCase() ===
                Strophe.getBareJidFromJid(jid2).toLowerCase();
    };

    u.getMostRecentMessage = function (model) {
        const messages = model.messages.filter('message');
        return messages[messages.length-1];
    }

    u.isNewMessage = function (message) {
        /* Given a stanza, determine whether it's a new
         * message, i.e. not a MAM archived one.
         */
        if (message instanceof Element) {
            return !(sizzle('result[xmlns="'+Strophe.NS.MAM+'"]', message).length);
        } else {
            return !message.get('archive_id');
        }
    };

    u.isOTRMessage = function (message) {
        var body = message.querySelector('body'),
            text = (!_.isNull(body) ? body.textContent: undefined);
        return text && !!text.match(/^\?OTR/);
    };

    u.isHeadlineMessage = function (message) {
        var from_jid = message.getAttribute('from');
        if (message.getAttribute('type') === 'headline') {
            return true;
        }
        if (message.getAttribute('type') !== 'error' &&
                !_.isNil(from_jid) &&
                !_.includes(from_jid, '@')) {
            // Some servers (I'm looking at you Prosody) don't set the message
            // type to "headline" when sending server messages. For now we
            // check if an @ signal is included, and if not, we assume it's
            // a headline message.
            return true;
        }
        return false;
    };

    u.merge = function merge (first, second) {
        /* Merge the second object into the first one.
         */
        for (var k in second) {
            if (_.isObject(first[k])) {
                merge(first[k], second[k]);
            } else {
                first[k] = second[k];
            }
        }
    };

    u.applyUserSettings = function applyUserSettings (context, settings, user_settings) {
        /* Configuration settings might be nested objects. We only want to
         * add settings which are whitelisted.
         */
        for (var k in settings) {
            if (_.isUndefined(user_settings[k])) {
                continue;
            }
            if (_.isObject(settings[k]) && !_.isArray(settings[k])) {
                applyUserSettings(context[k], settings[k], user_settings[k]);
            } else {
                context[k] = user_settings[k];
            }
        }
    };

    u.refreshWebkit = function () {
        /* This works around a webkit bug. Refreshes the browser's viewport,
         * otherwise chatboxes are not moved along when one is closed.
         */
        if (jQBrowser.webkit && window.requestAnimationFrame) {
            window.requestAnimationFrame(function () {
                var conversejs = document.getElementById('conversejs');
                conversejs.style.display = 'none';
                var tmp = conversejs.offsetHeight; // jshint ignore:line
                conversejs.style.display = 'block';
            });
        }
    };

    u.stringToDOM = function (s) {
        /* Converts an HTML string into a DOM element.
         *
         * Parameters:
         *      (String) s - The HTML string
         */
        var div = document.createElement('div');
        div.innerHTML = s;
        return div.childNodes;
    };

    u.matchesSelector = function (el, selector) {
        /* Checks whether the DOM element matches the given selector.
         *
         * Parameters:
         *      (DOMElement) el - The DOM element
         *      (String) selector - The selector
         */
        return (
            el.matches ||
            el.matchesSelector ||
            el.msMatchesSelector ||
            el.mozMatchesSelector ||
            el.webkitMatchesSelector ||
            el.oMatchesSelector
        ).call(el, selector);
    };

    u.queryChildren = function (el, selector) {
        /* Returns a list of children of the DOM element that match the
         * selector.
         *
         *  Parameters:
         *      (DOMElement) el - the DOM element
         *      (String) selector - the selector they should be matched
         *          against.
         */
        return _.filter(el.children, _.partial(u.matchesSelector, _, selector));
    };

    u.contains = function (attr, query) {
        return function (item) {
            if (typeof attr === 'object') {
                var value = false;
                _.forEach(attr, function (a) {
                    value = value || _.includes(item.get(a).toLowerCase(), query.toLowerCase());
                });
                return value;
            } else if (typeof attr === 'string') {
                return _.includes(item.get(attr).toLowerCase(), query.toLowerCase());
            } else {
                throw new TypeError('contains: wrong attribute type. Must be string or array.');
            }
        };
    };

    u.isOfType = function (type, item) {
        return item.get('type') == type;
    };

    u.isInstance = function (type, item) {
        return item instanceof type;
    };

    u.getAttribute = function (key, item) {
        return item.get(key);
    };

    u.contains.not = function (attr, query) {
        return function (item) {
            return !(u.contains(attr, query)(item));
        };
    };

    u.createFragmentFromText = function (markup) {
        /* Returns a DocumentFragment containing DOM nodes based on the
         * passed-in markup text.
         */
        // http://stackoverflow.com/questions/9334645/create-node-from-markup-string
        var frag = document.createDocumentFragment(),
            tmp = document.createElement('body'), child;
        tmp.innerHTML = markup;
        // Append elements in a loop to a DocumentFragment, so that the
        // browser does not re-render the document for each node.
        while (child = tmp.firstChild) {  // eslint-disable-line no-cond-assign
            frag.appendChild(child);
        }
        return frag
    };

    u.addEmoji = function (_converse, emojione, text) {
        if (_converse.use_emojione) {
            return emojione.toImage(text);
        } else {
            return emojione.shortnameToUnicode(text);
        }
    }

    u.getEmojisByCategory = function (_converse, emojione) {
        /* Return a dict of emojis with the categories as keys and
         * lists of emojis in that category as values.
         */
        if (_.isUndefined(_converse.emojis_by_category)) {
            const emojis = _.values(_.mapValues(emojione.emojioneList, function (value, key, o) {
                value._shortname = key;
                return value
            }));
            const tones = [':tone1:', ':tone2:', ':tone3:', ':tone4:', ':tone5:'];
            const excluded = [':kiss_ww:', ':kiss_mm:', ':kiss_woman_man:'];
            const excluded_substrings = [
                ':woman', ':man', ':women_', ':men_', '_man_', '_woman_', '_woman:', '_man:'
            ];
            const excluded_categories = ['modifier', 'regional'];
            const categories = _.difference(
                _.uniq(_.map(emojis, _.partial(_.get, _, 'category'))),
                excluded_categories
            );
            const emojis_by_category = {};
            _.forEach(categories, (cat) => {
                let list = _.sortBy(_.filter(emojis, ['category', cat]), ['uc_base']);
                list = _.filter(
                    list,
                    (item) => !_.includes(_.concat(tones, excluded), item._shortname) &&
                              !_.some(excluded_substrings, _.partial(_.includes, item._shortname))
                );
                if (cat === 'people') {
                    const idx = _.findIndex(list, ['uc_base', '1f600']);
                    list = _.union(_.slice(list, idx), _.slice(list, 0, idx+1));
                } else if (cat === 'activity') {
                    list = _.union(_.slice(list, 27-1), _.slice(list, 0, 27));
                } else if (cat === 'objects') {
                    list = _.union(_.slice(list, 24-1), _.slice(list, 0, 24));
                } else if (cat === 'travel') {
                    list = _.union(_.slice(list, 17-1), _.slice(list, 0, 17));
                } else if (cat === 'symbols') {
                    list = _.union(_.slice(list, 60-1), _.slice(list, 0, 60));
                }
                emojis_by_category[cat] = list;
            });
            _converse.emojis_by_category = emojis_by_category;
        }
        return _converse.emojis_by_category;
    };

    u.getTonedEmojis = function (_converse) {
        _converse.toned_emojis = _.uniq(
            _.map(
                _.filter(
                    u.getEmojisByCategory(_converse).people,
                    (person) => _.includes(person._shortname, '_tone')
                ),
                (person) => person._shortname.replace(/_tone[1-5]/, '')
            ));
        return _converse.toned_emojis;
    };

    u.isPersistableModel = function (model) {
        return model.collection && model.collection.browserStorage;
    };

    u.getResolveablePromise = function () {
        /* Returns a promise object on which `resolve` or `reject` can be
         * called.
         */
        const wrapper = {};
        const promise = new Promise((resolve, reject) => {
            wrapper.resolve = resolve;
            wrapper.reject = reject;
        })
        _.assign(promise, wrapper);
        return promise;
    };

    u.safeSave = function (model, attributes) {
        if (u.isPersistableModel(model)) {
            model.save(attributes);
        } else {
            model.set(attributes);
        }
    }

    u.isVisible = function (el) {
        // XXX: Taken from jQuery's "visible" implementation
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
    };

    return u;
}));
