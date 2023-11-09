(function () {
    "use strict";

    // Enums "JavaScript Objects" for Tokens and AST.
    // This makes typing and searching for related code easier.
    var tokenTypes = {
        js: 0,
        e_start: 1,
        e_end: 2,
        e_prop: 3,
        e_value: 4,
        e_child_text: 5,
        e_child_js: 6,
        e_child_whitespace: 7,
        e_child_js_start: 8,
        e_child_js_end: 9,
    };
    var astTypes = {
        program: 0,
        js: 1,
        createElement: 2,
    };

    // Convert enum props to strings so they can be viewed easily from DevTools
    var enums = [tokenTypes, astTypes];
    for (var n = 0, m = enums.length; n < m; n++) {
        var obj = enums[n];
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                obj[prop] = prop;
            }
        }
    }

    /**
     * [jsxLoader] Object
     *
     * If using optional properties or functions then the should be set immediately after this
     * script is defined and before the [DOMContentLoaded] event is triggered. Example:
     *
     * <script src="jsxLoader.js"></script>
     * <script>
     *     jsxLoader.logCompileTime = true;
     *     jsxLoader.logCompileDetails = true;
     *     jsxLoader.evalCode = '{string}';
     *     jsxLoader.jsUpdates.push({ find:/regex_search/g, replace:'{string}' });
     *     jsxLoader.usePreact();
     *     jsxLoader.addBabelPolyfills = function() { '...'; }
     *     jsxLoader.compiler.pragma = 'Vue.h';
     *     jsxLoader.compiler.pragmaFrag = 'Vue.Fragment';
     *     jsxLoader.compiler.addUseStrict = false;
     * </script>
     */
    var jsxLoader = {
        /**
         * Default options for fetching JSX Templates. To use different options
         * set this as soon as the script is loaded and before the document
         * 'DOMContentLoaded' event runs. The default options provide for
         * flexibility with 'cors', prevention of caching issues with 'no-store',
         * and security by using 'same-origin' for `credentials`.
         */
        fetchOptions: {
            mode: "cors",
            cache: "default",
            credentials: "same-origin",
        },

        /**
         * Print compile start, end, and time taken to console.
         */
        logCompileTime: true,

        /**
         * Print compile tokens and Abstract Syntax Tree (AST) to the console.
         * If `true` then `logCompileTime` will also run.
         */
        logCompileDetails: false,

        /**
         * When using the compiler from jsxLoader specific code for ES or node modules should
         * be updated or removed. This includes the `import React from 'react'` that used when
         * building React Apps from Node. When used in a Browser `React` will already exist as
         * a Global and `import` doesn't work with node modules. A calling app can modify this
         * list as needed for custom generated code to work.
         *
         * Additionally this can be used to support React Alternatives such as Preact and Rax.
         * See demos and Unit Tests for usage. When calling `jsxLoader.usePreact()` this list
         * will be automatically updated for Preact.
         */
        jsUpdates: [
            { find: /=>,/g, replace: "=>" }, // Work-around for edge-case JSX, Issue 21 on GitHub
        ],

        /**
         * This property gets set to either `true` or `false` depending on `evalCode`.
         * When `false` it means that Babel was downloaded and used to compile JSX.
         * To manually override the default setup set this a value prior to the
         * 'DOMContentLoaded' event.
         */
        isSupportedBrowser: true,

        /**
         * Return `true|false` depending on whether or not all scripts can be loaded.
         * This can be used by the calling page to determine if scripts are still being
         * compiled. This would not commonly be used and is intended for Unit Testing.
         *
         * @return {bool}
         */
        hasPendingScripts: function () {
            var scripts = document.querySelectorAll(
                'script[type="text/babel"]:not([data-added-to-page])',
            );
            return scripts.length > 0;
        },

        /**
         * Setup Event
         *
         * This gets called automatically when the page is loaded from the
         * [DOMContentLoaded] event or it can be called manually if needed.
         *
         * It will automatically download and load all <script type="text/babel"> scripts
         * in the order that they are defined on the page.
         */
        setup: function () {
            // Get all scripts and if there is only one then load it
            var scripts = document.querySelectorAll(
                'script[type="text/babel"]:not([data-added-to-page])',
            );
            if (scripts.length === 1) {
                jsxLoader.loadScript(scripts[0]);
                return;
            }

            // Private function to Download JSX Source based on <script src="{url}">
            // This is based on `loadScript()` however it only downloads and doesn't
            // compile or add the script. This allows scripts to be added on the page
            // in the expected order based on how they are defined in the HTML.
            // Github Issue 22
            function downloadJsx(element) {
                var result = {
                    element: element,
                    text: "",
                    error: null,
                };
                return new Promise(function (resolve) {
                    fetch(element.src, jsxLoader.fetchOptions)
                        .then(function (res) {
                            var status = res.status;
                            if (
                                (status >= 200 && status < 300) ||
                                status === 304
                            ) {
                                return res.text();
                            } else {
                                throw new Error(
                                    "Error loading data. Server Response Code: " +
                                        status +
                                        ", Response Text: " +
                                        res.statusText,
                                );
                            }
                        })
                        .then(function (text) {
                            result.text = text;
                            resolve(result);
                        })
                        .catch(function (error) {
                            result.error = error;
                            resolve(result);
                        });
                });
            }

            // First asynchronously download all scripts that contain the [src] attribute.
            // Scripts that contain embedded content will run after all downloads finish.
            // The reason is inline scripts are expected to be dependent on the downloaded scripts.
            var promisesSrc = [];
            var scriptsNoSrc = [];
            Array.prototype.forEach.call(scripts, function (script) {
                if (script.src === "") {
                    scriptsNoSrc.push(script);
                } else {
                    promisesSrc.push(downloadJsx(script));
                }
            });

            // Compile and add scripts to the page once all [src] scripts are downloaded
            Promise.all(promisesSrc).then(function (results) {
                results.forEach(function (result) {
                    jsxLoader.loadScript(
                        result.element,
                        result.text,
                        result.error,
                    );
                });
                scriptsNoSrc.forEach(function (script) {
                    jsxLoader.loadScript(script);
                });
            });
        },

        /**
         * Load a Babel Script and add it to the page as JavaScript. This function
         * gets called by [setup()] for each <script type="text/babel"> on the page.
         *
         * This function returns a Promise that resolves once the script has been
         * added to the page regardless of whether or not it had an error. This
         * behavior is used so that `Promise.all(scripts).finally()` logic can be
         * used when loading multiple scripts.
         *
         * Parameters `downloadedSrc` and `downloadError` are intended only
         * for internal use.
         *
         * @param {HTMLScriptElement} element
         * @param {string|undefined} downloadedSrc
         * @param {mixed|undefined} downloadError
         * @return {Promise}
         */
        loadScript: function (element, downloadedSrc, downloadError) {
            function addToPage(text, callback, src) {
                // Status
                var startTime = new Date();
                if (jsxLoader.logCompileTime || jsxLoader.logCompileDetails) {
                    console.log("=".repeat(80));
                    console.log(element.src);
                    console.log("Start time: " + startTime.getTime());
                }

                // Compile the React/JSX Code to JavaScript
                var js, compilerType;
                try {
                    if (jsxLoader.isSupportedBrowser) {
                        js = jsxLoader.compiler.compile(text);
                        compilerType = "jsxLoader";
                    } else {
                        js = Babel.transform(text, jsxLoader.babelOptions).code;
                        compilerType = "Babel";
                    }
                } catch (e) {
                    console.log("-".repeat(80));
                    console.log("Compile Error:");
                    console.log(element);
                    console.error(e);
                    element.setAttribute("data-error", e.toString());
                    js = null;
                }

                // Status
                if (jsxLoader.logCompileDetails) {
                    console.log(js);
                }
                if (jsxLoader.logCompileTime || jsxLoader.logCompileDetails) {
                    var endTime = new Date();
                    console.log("End time: " + endTime.getTime());
                    console.log(
                        "Time taken (in milliseconds): " +
                            (endTime.getTime() - startTime.getTime()),
                    );
                }

                // Exit if there was a JavaScript compile error
                if (js === null) {
                    callback();
                    return;
                }

                // Find and replace contents in the generated JavaScript. See comments in the [jsUpdates] property
                jsxLoader.jsUpdates.forEach(function (item) {
                    js = js.replace(item.find, item.replace);
                });

                // Add compiled JS ad a new <script> on the page.
                // If the JSX compiles correctly but there is a JavaScript error then
                // it will not be caught here and the calling app would have to use
                // global error handling `window.onerror` to catch the error. Because
                // it is not caught [data-error] will not appear on the <script> element.
                var script = document.createElement("script");
                if (src) {
                    script.setAttribute("data-src", src);
                }
                script.setAttribute("data-compiler", compilerType);
                if (element.getAttribute("data-type") === "module") {
                    script.type = "module";
                }
                script.innerHTML = js;
                document.head.appendChild(script);
                callback();
            }

            return new Promise(function (resolve) {
                // Inline JSX in the <script> Element
                if (element.src === "") {
                    addToPage(element.innerHTML, resolve);
                    element.setAttribute("data-added-to-page", "");
                    return;
                }

                // Already downloaded from setup
                if (typeof downloadedSrc === "string") {
                    if (downloadError) {
                        console.error(downloadError);
                        element.setAttribute("data-added-to-page", "");
                        element.setAttribute(
                            "data-error",
                            downloadError.toString(),
                        );
                        resolve();
                    } else {
                        addToPage(
                            downloadedSrc,
                            resolve,
                            element.getAttribute("src"),
                        );
                        element.setAttribute("data-added-to-page", "");
                    }
                    return;
                }

                // Download JSX Source based on <script src="{url}">
                fetch(element.src, jsxLoader.fetchOptions)
                    .then(function (res) {
                        var status = res.status;
                        if ((status >= 200 && status < 300) || status === 304) {
                            return res.text();
                        } else {
                            throw new Error(
                                "Error loading data. Server Response Code: " +
                                    status +
                                    ", Response Text: " +
                                    res.statusText,
                            );
                        }
                    })
                    .then(function (text) {
                        addToPage(text, resolve, element.getAttribute("src"));
                        element.setAttribute("data-added-to-page", "");
                    })
                    .catch(function (error) {
                        console.error(error);
                        element.setAttribute("data-added-to-page", "");
                        element.setAttribute("data-error", error.toString());
                        resolve();
                    });
            });
        },

        /**
         * Add a <script> element to the page from a URL. This function is used
         * internally for loading [polyfillUrl] and [babelUrl]. It only handles regular
         * JavaScript and not JSX. For JSX Scripts see the [loadScript()] function.
         *
         * @param {string} url
         * @param {function} callback
         */
        downloadScript: function (url, callback) {
            var script = document.createElement("script");
            script.onload = callback;
            script.onerror = function () {
                console.error("Error loading Script: " + url);
                callback();
            };
            script.src = url;
            document.head.appendChild(script);
        },

        /**
         * Compiler for converting React/JSX Code to JavaScript. See comments
         * near the top of this file for info on the compiler.
         */
        compiler: {
            /**
             * Compiler Options
             */
            pragma: "React.createElement",
            pragmaFrag: "React.Fragment",
            maxRecursiveCalls: 1000,
            addUseStrict: true,

            /**
             * Compile JSX to JS
             *
             * @param {string} input
             * @return {string}
             */
            compile: function (input) {
                // Compiler Step 1 - Remove Comments from the Code
                var newInput = this.removeComments(input);

                // Compiler Step 2 (Lexical Analysis) - Convert JSX Code to an array of tokens
                var tokens = this.tokenizer(newInput);
                if (jsxLoader.logCompileDetails) {
                    console.log(tokens);
                }

                // Compiler Step 3 (Syntactic Analysis) - Convert Tokens to an Abstract Syntax Tree (AST)
                var ast = this.parser(tokens, input);
                if (jsxLoader.logCompileDetails) {
                    console.log(ast);
                }

                // Compiler Step 4 (Code Generation) - Convert AST to Code
                var output = this.codeGenerator(ast, input);
                return output;
            },

            /**
             * Helper function to return line/column numbers when an error occurs
             *
             * @param {string} input
             * @param {int} pos
             * @return {string}
             */
            getTextPosition: function (input, pos) {
                var lines = input.substring(0, pos).split("\n");
                var lineCount = lines.length;
                var line = lines[lineCount - 1];
                return (
                    " at Line #: " +
                    lineCount +
                    ", Column #: " +
                    (line.length - 1) +
                    ", Line: " +
                    line.trim()
                );
            },

            /**
             * Helper function that gets called when a '<' character is
             * found to determine if it's likely an element or not.
             *
             * @param {string} input
             * @param {number} current
             * @param {number} length
             * @returns {bool}
             */
            isExpression: function (input, current, length) {
                var pos = current + 2;
                var foundName = false;
                while (pos < length) {
                    var nextChar = input[pos];
                    pos++;
                    if (/[a-zA-Z0-9_/]/.test(nextChar)) {
                        if (foundName) {
                            break;
                        } else {
                            continue;
                        }
                    } else if (nextChar === ">") {
                        break;
                    } else if (nextChar === " ") {
                        foundName = true;
                        continue;
                    } else if (
                        nextChar === ")" ||
                        nextChar === "&" ||
                        nextChar === "|" ||
                        nextChar === "?" ||
                        nextChar === ";"
                    ) {
                        // This happens if an less than expression uses no spaces and the
                        // right-hand side value is a variable. Issue #20 on GitHub.
                        return true;
                    }
                }
                return false;
            },

            /**
             * Compiler Step 1 - Remove Comments from the Code
             *
             * All Code Comments are simply replaced with whitespace. This keeps the
             * original structure of the code and allows for error messages to report on
             * the correct line/column position of the error. Additionally it simplifies
             * lexical analysis because there is no need to tokenize the comments.
             *
             * Note - this function should handle most but may not handle all comments.
             * If new issues parsing are discovered this function needs to be updated to
             * better handle them.
             *
             * @param {string} input
             * @return {string}
             */
            removeComments: function (input) {
                var length = input.length,
                    newInput = new Array(length),
                    state = {
                        inCommentReact: false,
                        inCommentSingleLine: false,
                        inCommentMultiLine: false,
                        inStringSingleQuote: false,
                        inStringDoubleQuote: false,
                        inStringMultiLine: false,
                        elementCount: 0,
                        jsCount: 0,
                    },
                    current = 0,
                    char,
                    charNext;

                function peekNext() {
                    return current < length - 1 ? input[current + 1] : null;
                }
                function peekNext2() {
                    return current < length - 2
                        ? input[current + 1] + input[current + 2]
                        : null;
                }

                while (current < length) {
                    char = input[current];
                    if (state.inCommentReact) {
                        if (char === "*" && peekNext2() === "/}") {
                            newInput[current] = " ";
                            newInput[current + 1] = " ";
                            current += 2;
                            char = " ";
                            state.inCommentReact = false;
                        } else if (char !== "\n") {
                            char = " ";
                        }
                    } else if (state.inCommentSingleLine) {
                        if (char === "\n") {
                            state.inCommentSingleLine = false;
                        } else {
                            char = " ";
                        }
                    } else if (state.inCommentMultiLine) {
                        if (char == "*" && peekNext() === "/") {
                            newInput[current] = " ";
                            current++;
                            char = " ";
                            state.inCommentMultiLine = false;
                        } else if (char !== "\n") {
                            char = " ";
                        }
                    } else if (state.inStringDoubleQuote) {
                        if (char === '"' && input[current - 1] !== "\\") {
                            state.inStringDoubleQuote = false;
                        }
                    } else if (state.inStringSingleQuote) {
                        if (char === "'" && input[current - 1] !== "\\") {
                            state.inStringSingleQuote = false;
                        }
                    } else if (state.inStringMultiLine) {
                        if (char === "`") {
                            state.inStringMultiLine = false;
                        }
                    } else {
                        switch (char) {
                            case "{":
                                if (peekNext2() === "/*") {
                                    newInput[current] = " ";
                                    newInput[current + 1] = " ";
                                    current += 2;
                                    char = " ";
                                    state.inCommentReact = true;
                                } else if (state.elementCount > 0) {
                                    state.jsCount++;
                                }
                                break;
                            case "}":
                                if (
                                    state.elementCount > 0 &&
                                    state.jsCount > 0
                                ) {
                                    state.jsCount--;
                                }
                                break;
                            case "/":
                                if (
                                    state.elementCount === 0 ||
                                    state.jsCount > 0
                                ) {
                                    var next = peekNext();
                                    state.inCommentSingleLine = next === "/";
                                    if (!state.inCommentSingleLine) {
                                        state.inCommentMultiLine = next === "*";
                                    }
                                    if (
                                        state.inCommentSingleLine ||
                                        state.inCommentMultiLine
                                    ) {
                                        newInput[current] = " ";
                                        current++;
                                        char = " ";
                                    }
                                }
                                break;
                            case '"':
                                state.inStringDoubleQuote = true;
                                break;
                            case "'":
                                state.inStringSingleQuote = true;
                                break;
                            case "`":
                                state.inStringMultiLine = true;
                                break;
                            case "<":
                                charNext = peekNext();
                                if (
                                    /[a-zA-Z>]/.test(charNext) &&
                                    !this.isExpression(input, current, length)
                                ) {
                                    state.elementCount++;
                                } else if (charNext === "/") {
                                    state.elementCount--;
                                }
                                break;
                            case ">":
                                if (
                                    input[current - 1] === "/" &&
                                    state.elementCount > 0
                                ) {
                                    state.elementCount--;
                                }
                                break;
                        }
                    }
                    newInput[current] = char;
                    current++;
                }
                return newInput.join("");
            },

            /**
             * Compiler Step 2 (Lexical Analysis) - Convert JSX Code to an array of tokens.
             *
             * Warning, this function is large, contains recursive private functions, and is
             * built for speed and features over readability. Using breakpoints with DevTools
             * is recommended when making changes and to better understand how the code works.
             *
             * @param {string} input
             * @return {array}
             */
            tokenizer: function (input) {
                var length = input.length,
                    current = 0,
                    tokens = [],
                    char,
                    pos,
                    loopCount = 0,
                    callCount = 0,
                    nextChar,
                    maxRecursiveCalls = this.maxRecursiveCalls;

                // Private function to return the next React/JSX Element
                function nextElementPos() {
                    var c = current,
                        char,
                        state = {
                            inStringSingleQuote: false,
                            inStringDoubleQuote: false,
                            inStringMultiLine: false,
                        };

                    while (c < length - 1) {
                        char = input[c];
                        if (state.inStringDoubleQuote) {
                            if (char === '"' && input[c - 1] !== "\\") {
                                state.inStringDoubleQuote = false;
                            }
                        } else if (state.inStringSingleQuote) {
                            if (char === "'" && input[c - 1] !== "\\") {
                                state.inStringSingleQuote = false;
                            }
                        } else if (state.inStringMultiLine) {
                            if (char === "`") {
                                state.inStringMultiLine = false;
                            }
                        } else {
                            switch (char) {
                                case '"':
                                    state.inStringDoubleQuote = true;
                                    break;
                                case "'":
                                    state.inStringSingleQuote = true;
                                    break;
                                case "`":
                                    state.inStringMultiLine = true;
                                    break;
                                case "<":
                                    if (
                                        /[a-zA-Z>]/.test(input[c + 1]) &&
                                        !jsxLoader.compiler.isExpression(
                                            input,
                                            c,
                                            length,
                                        )
                                    ) {
                                        return c; // Start of Element found
                                    }
                                    break;
                            }
                        }
                        c++;
                    }
                    return null;
                }

                // Private functions to return the current or next characters without
                // incrementing the counter for the current position.
                function peekCurrent() {
                    return current < length ? input[current] : null;
                }
                function peekNext() {
                    return current < length ? input[current + 1] : null;
                }

                // Safety check to prevent endless loops on unexpected errors.
                // The number of loops should always be less that then string length.
                function loopCheck() {
                    loopCount++;
                    if (loopCount > length) {
                        throw new Error(
                            "Endless loop encountered in tokenizer",
                        );
                    }
                }

                function tokenizeElement(startPosition, firstNode) {
                    // Safety check
                    callCount++;
                    if (callCount > maxRecursiveCalls) {
                        throw new Error(
                            "Call count exceeded in tokenizer. If you have a large JSX file that is valid you can increase them limit using the property `jsxLoader.compiler.maxRecursiveCalls`.",
                        );
                    }

                    // Current state of the processed text
                    var state = {
                        value: input[pos],
                        elementStack: 0,
                        elementState: [],
                        currentElementState: null,
                        inElement: true,
                        hasElementName: false,
                        elementClosed: false,
                        closeElement: false,
                        closingElement: false,
                        fatalError: false,
                        errorMessage: null,
                        addElementEnd: false,
                        breakLoop: false,
                        addChild: false,
                        addChar: true,
                        hasProp: false,
                        inValue: false,
                        inPropString: false,
                        propStringChar: null,
                        jsWithElement: false,
                    };

                    // Add text up to the matched position as JavaScript
                    if (current < startPosition && firstNode) {
                        tokens.push({
                            type: tokenTypes.js,
                            value: input.substring(current, startPosition),
                            pos: current,
                        });
                    }

                    // Tokenize the current React element. This loop inside the recursive function
                    // provides core logic to process characters one at a time. The loop from the main
                    // calling function is used to find JSX elements.
                    current = startPosition + 1;
                    while (current < length) {
                        loopCheck();

                        // Get the character at the current position in the input string
                        char = input[current];

                        // Handle character differently depending on if the current
                        // position is still inside the <element> `state.inElement`
                        // or if it is in a child/code section <element>{code}</element>
                        if (state.inElement) {
                            if (state.hasElementName) {
                                state.value += char;
                                current++;
                                state.breakLoop = false;
                                state.hasProp = false;
                                state.inValue = false;
                                while (current < length) {
                                    loopCheck();
                                    char = input[current];
                                    current++;
                                    if (
                                        state.inPropString &&
                                        char !== state.propStringChar
                                    ) {
                                        state.value += char;
                                        continue;
                                    }
                                    switch (char) {
                                        case "=":
                                            if (
                                                state.currentElementState
                                                    .inPropJs
                                            ) {
                                                break;
                                            }
                                            if (state.value.trim() !== "") {
                                                tokens.push({
                                                    type: tokenTypes.e_prop,
                                                    value: state.value,
                                                    pos: current,
                                                });
                                                state.hasProp = true;
                                                state.inValue = true;
                                            }
                                            state.value = "";
                                            nextChar = peekCurrent();
                                            if (
                                                nextChar === '"' ||
                                                nextChar === "'"
                                            ) {
                                                state.inPropString = true;
                                                state.propStringChar = nextChar;
                                                current++;
                                            } else if (nextChar === "{") {
                                                state.currentElementState.inPropJs = true;
                                                state.currentElementState.jsPropBracketCount = 0;
                                                current++;
                                            }
                                            continue;
                                        case state.propStringChar:
                                            if (state.inPropString) {
                                                state.inPropString = false;
                                                tokens.push({
                                                    type: state.hasProp
                                                        ? tokenTypes.e_value
                                                        : tokenTypes.e_prop,
                                                    value: JSON.stringify(
                                                        state.value,
                                                    ),
                                                    pos: current,
                                                });
                                                state.inValue = false;
                                                state.hasProp = false;
                                                state.value = "";
                                                continue;
                                            }
                                            break;
                                        case "}":
                                            if (
                                                state.currentElementState
                                                    .inPropJs
                                            ) {
                                                if (
                                                    state.currentElementState
                                                        .jsPropBracketCount ===
                                                    0
                                                ) {
                                                    state.currentElementState.inPropJs = false;
                                                    if (
                                                        state.value.trim() !==
                                                        ""
                                                    ) {
                                                        if (
                                                            state.jsWithElement
                                                        ) {
                                                            tokens.push({
                                                                type: tokenTypes.e_child_js_end,
                                                                value: state.value,
                                                                pos: current,
                                                            });
                                                            state.jsWithElement = false;
                                                        } else {
                                                            if (
                                                                state.value.trim() !==
                                                                ">"
                                                            ) {
                                                                tokens.push({
                                                                    type: tokenTypes.e_value,
                                                                    value: state.value,
                                                                    pos: current,
                                                                });
                                                                state.hasProp = false;
                                                            }
                                                        }
                                                    }
                                                    state.inValue = false;
                                                    state.value = "";
                                                    continue;
                                                } else {
                                                    state.currentElementState
                                                        .jsPropBracketCount--;
                                                }
                                            }
                                            break;
                                        case " ":
                                        case "\t":
                                        case "\r":
                                        case "\n":
                                            if (
                                                !state.currentElementState
                                                    .inPropJs
                                            ) {
                                                if (state.value.trim() !== "") {
                                                    tokens.push({
                                                        type: state.hasProp
                                                            ? tokenTypes.e_value
                                                            : tokenTypes.e_prop,
                                                        value: state.value,
                                                        pos: current,
                                                    });
                                                }
                                                state.inValue = false;
                                                state.value = "";
                                            }
                                            break;
                                        case "/":
                                            if (peekCurrent() === ">") {
                                                current--;
                                                state.breakLoop = true;
                                                state.hasElementName = false;
                                            }
                                            break;
                                        case "<":
                                            if (
                                                state.currentElementState
                                                    .inPropJs &&
                                                peekCurrent() !== " "
                                            ) {
                                                if (state.value.trim() !== "") {
                                                    tokens.push({
                                                        type: tokenTypes.e_child_js_start,
                                                        value: state.value,
                                                        pos: current,
                                                    });
                                                    state.value = "";
                                                    state.jsWithElement = true;
                                                }
                                                current--;
                                                tokenizeElement(current, false);
                                                char = "";
                                                if (state.jsWithElement) {
                                                    current++;
                                                }
                                            }
                                            break;
                                        case "{":
                                            if (
                                                state.currentElementState
                                                    .inPropJs
                                            ) {
                                                state.currentElementState
                                                    .jsPropBracketCount++;
                                            }
                                            break;
                                        case ">":
                                            if (
                                                !state.currentElementState
                                                    .inPropJs
                                            ) {
                                                state.breakLoop = true;
                                                state.hasElementName = false;
                                            }
                                            break;
                                    }
                                    if (state.breakLoop) {
                                        var trimValue = state.value.trim();
                                        var lastToken =
                                            tokens[tokens.length - 1];
                                        if (
                                            state.value === "/" &&
                                            char === ">" &&
                                            lastToken.type ===
                                                tokenTypes.e_start
                                        ) {
                                            tokens.push({
                                                type: tokenTypes.e_end,
                                                value: state.value + char,
                                                pos: current,
                                            });
                                            if (state.elementStack <= 1) {
                                                if (peekCurrent() !== "}") {
                                                    current--;
                                                }
                                                return;
                                            } else {
                                                state.elementStack--;
                                                state.elementState.pop();
                                                state.currentElementState =
                                                    state.elementStack === 0
                                                        ? null
                                                        : state.elementState[
                                                              state.elementStack -
                                                                  1
                                                          ];
                                            }
                                        } else if (
                                            char === ">" &&
                                            trimValue !== "" &&
                                            (/^[a-zA-Z0-9-_]*$/.test(
                                                trimValue,
                                            ) ||
                                                /{\.\.\.(.+)}/.test(
                                                    trimValue,
                                                )) &&
                                            (lastToken.type ===
                                                tokenTypes.e_start ||
                                                lastToken.type ===
                                                    tokenTypes.e_value)
                                        ) {
                                            tokens.push({
                                                type: tokenTypes.e_prop,
                                                value: trimValue,
                                                pos: current,
                                            });
                                        } else if (trimValue !== "") {
                                            console.log(tokens);
                                            throw new Error(
                                                "Unhandled character in element properties: `" +
                                                    state.value +
                                                    "`" +
                                                    jsxLoader.compiler.getTextPosition(
                                                        input,
                                                        current,
                                                    ),
                                            );
                                        }
                                        state.value = "";
                                        state.breakLoop = false;
                                        break;
                                    }
                                    state.value += char;
                                }
                            }
                            switch (char) {
                                case "/":
                                    if (
                                        state.value === "" ||
                                        state.value === "<"
                                    ) {
                                        state.closingElement = true;
                                    } else if (peekCurrent() === ">") {
                                        state.closeElement = true;
                                        state.inElement = false;
                                        state.addElementEnd = true;
                                    } else if (peekNext() === ">") {
                                        state.closeElement = true;
                                        state.hasElementName = true;
                                        char = "";
                                        current--;
                                    } else {
                                        state.fatalError = true;
                                        state.errorMessage =
                                            'Error found a "/" character in element [' +
                                            state.value +
                                            '] but not closing "/>"' +
                                            jsxLoader.compiler.getTextPosition(
                                                input,
                                                current,
                                            );
                                    }
                                    break;
                                case ">":
                                    state.closeElement = true;
                                    state.inElement = false;
                                    break;
                                case " ":
                                case "\t":
                                case "\n":
                                case "\r":
                                    state.hasElementName = true;
                                    state.closeElement = true;
                                    break;
                            }
                        } else {
                            switch (char) {
                                case "}":
                                    if (state.currentElementState.inJs) {
                                        if (
                                            state.currentElementState
                                                .jsBracketCount === 0
                                        ) {
                                            state.currentElementState.inJs = false;
                                            state.currentElementState.closeJs = true;
                                            state.addChild = true;
                                            state.addChar = false;
                                        } else {
                                            state.currentElementState
                                                .jsBracketCount--;
                                        }
                                    }
                                    break;
                                case "{":
                                    if (state.currentElementState.inJs) {
                                        state.currentElementState
                                            .jsBracketCount++;
                                    } else {
                                        state.currentElementState.inJs = true;
                                        state.currentElementState.jsBracketCount = 0;
                                        state.addChild = true;
                                        state.addChar = false;
                                    }
                                    break;
                                case "<":
                                    if (
                                        /[a-zA-Z>/]/.test(peekNext()) &&
                                        !jsxLoader.compiler.isExpression(
                                            input,
                                            current,
                                            length,
                                        )
                                    ) {
                                        state.addChild = true;
                                        state.inElement = true;
                                    }
                                    break;
                            }
                            if (state.addChild) {
                                if (state.value.trim() === "") {
                                    if (state.value !== "") {
                                        tokens.push({
                                            type: tokenTypes.e_child_whitespace,
                                            value: state.value,
                                            pos: current,
                                        });
                                    }
                                } else {
                                    var isJS =
                                        state.currentElementState.closeJs ||
                                        (state.currentElementState.inJs &&
                                            state.currentElementState
                                                .jsBracketCount > 0) ||
                                        (state.currentElementState.inJs &&
                                            state.inElement);
                                    tokens.push({
                                        type: isJS
                                            ? tokenTypes.e_child_js
                                            : tokenTypes.e_child_text,
                                        value: state.value,
                                        pos: current,
                                    });
                                }
                                state.addChild = false;
                                state.value = "";
                                if (state.currentElementState.closeJs) {
                                    state.currentElementState.closeJs = false;
                                    state.currentElementState.inJs = false;
                                }
                            }
                        }

                        // Should the current element be closed?
                        if (state.closeElement) {
                            if (
                                char !== " " &&
                                char !== "\t" &&
                                char !== "\n" &&
                                char !== "\r"
                            ) {
                                state.value += char;
                            }
                            if (state.closingElement) {
                                tokens.push({
                                    type: tokenTypes.e_end,
                                    value: state.value,
                                    pos: current,
                                });
                                state.hasElementName = false;
                                state.elementStack--;
                                state.elementState.pop();
                                state.currentElementState =
                                    state.elementStack === 0
                                        ? null
                                        : state.elementState[
                                              state.elementStack - 1
                                          ];
                                if (state.elementStack === 0) {
                                    state.elementClosed = true;
                                }
                            } else {
                                if (state.value === ">") {
                                    current--;
                                } else {
                                    tokens.push({
                                        type: tokenTypes.e_start,
                                        value: state.value,
                                        pos: current,
                                    });
                                    state.elementStack++;
                                    state.currentElementState = {
                                        inJs: false,
                                        jsBracketCount: 0,
                                        closeJs: false,
                                        inPropJs: false,
                                        jsPropBracketCount: 0,
                                    };
                                    state.elementState.push(
                                        state.currentElementState,
                                    );
                                }
                            }
                            state.value = "";
                            state.closeElement = false;
                            state.closingElement = false;
                            if (state.addElementEnd) {
                                tokens.push({
                                    type: tokenTypes.e_end,
                                    value: state.value,
                                    pos: null,
                                });
                                state.addElementEnd = false;
                            }
                        } else {
                            if (state.addChar) {
                                state.value += char;
                            }
                            state.addChar = true;
                        }

                        // Exit nested element loop once the element has been closed
                        if (state.elementClosed) {
                            break;
                        }

                        // Next character
                        current++;
                    } // End of `while (current < length)` loop in the recursive `tokenizeElement()` function

                    // Was there a fatal error in the loop?
                    if (state.fatalError) {
                        console.log(tokens);
                        throw new Error(state.errorMessage);
                    }
                }

                // Main loop to find and process JSX elements inside of plain JS
                while (current < length) {
                    loopCheck();

                    // Find the next React Element and add remaining js once all elements are found
                    pos = nextElementPos();
                    if (pos === null) {
                        tokens.push({
                            type: tokenTypes.js,
                            value: input.substring(current, length),
                            pos: current,
                        });
                        break;
                    }

                    tokenizeElement(pos, true);
                    current++;
                }
                return tokens;
            },

            /**
             * Compiler Step 3 (Syntactic Analysis) - Convert Tokens to an Abstract Syntax Tree (AST)
             *
             * @param {array} tokens
             * @param {string} input Original input is passed to allow for helpful error messages
             * @return {object}
             */
            parser: function (tokens, input) {
                var current = 0,
                    ast = {
                        type: astTypes.program,
                        body: [],
                        pos: null,
                    },
                    callCount = 0,
                    tokenCount = tokens.length,
                    maxRecursiveCalls = this.maxRecursiveCalls,
                    pragmaFrag = this.pragmaFrag,
                    e_start_count = 0,
                    e_end_count = 0;

                // Default to use `React.Fragment`, however if a code hint for
                // Babel is found such as `// @jsxFrag Vue.Fragment` then use
                // the `Fragment` component from the code hint.
                var regex = /(\/\/|\/\*|\/\*\*)\s+@jsxFrag\s+([a-zA-Z.]+)/gm;
                var match = regex.exec(input);
                if (match) {
                    pragmaFrag = match[2];
                }

                function nextTokenType() {
                    if (current < tokenCount) {
                        return tokens[current].type;
                    }
                    return null;
                }

                function walk(stackCount, startingToken) {
                    callCount++;
                    if (callCount > maxRecursiveCalls) {
                        throw new Error(
                            "Call count exceeded in parser. If you have a large JSX file that is valid you can increase them limit using the property `jsxLoader.compiler.maxRecursiveCalls`.",
                        );
                    }

                    var token = tokens[current];
                    current++;

                    if (token.type === tokenTypes.js) {
                        return {
                            type: astTypes.js,
                            value: token.value,
                            pos: token.pos,
                            stackCount: stackCount,
                        };
                    }

                    if (token.type === tokenTypes.e_start) {
                        e_start_count++;
                        var elName = token.value
                            .replace("<", "")
                            .replace("/", "")
                            .replace(">", "");
                        if (elName === "") {
                            elName = pragmaFrag;
                        }
                        var firstChar = elName[0];
                        var node = {
                            type: astTypes.createElement,
                            name: elName,
                            isClass:
                                (firstChar >= "A" && firstChar <= "Z") ||
                                elName.indexOf(".") !== -1,
                            props: [],
                            children: [],
                            pos: token.pos,
                            stackCount: stackCount,
                        };

                        var breakLoop = false;
                        var value;
                        while (current < tokenCount) {
                            token = tokens[current];
                            current++;
                            switch (token.type) {
                                case tokenTypes.e_prop:
                                    var prop = {
                                        name: token.value,
                                        value: null,
                                        pos: token.pos,
                                    };
                                    var nextNodeType = nextTokenType();
                                    switch (nextNodeType) {
                                        case tokenTypes.e_value:
                                        case tokenTypes.js:
                                            prop.value = tokens[current].value;
                                            current++;
                                            break;
                                        case tokenTypes.e_start:
                                            prop.value = walk(stackCount + 1);
                                            break;
                                        case tokenTypes.e_child_js_start:
                                            prop.value = walk(
                                                stackCount + 1,
                                                tokenTypes.e_child_js_start,
                                            );
                                            break;
                                    }
                                    if (prop.name.trim() !== "") {
                                        node.props.push(prop);
                                    }
                                    break;
                                case tokenTypes.e_child_js:
                                    if (token.value.trim() !== "") {
                                        value = token.value.trim();
                                        if (value.indexOf("{") === 0) {
                                            value = value.substring(1);
                                        }
                                        if (
                                            value.substring(
                                                value.length - 1,
                                                value.length,
                                            ) === "}"
                                        ) {
                                            value = value.substring(
                                                0,
                                                value.length - 1,
                                            );
                                        }
                                        node.children.push({
                                            type: token.type,
                                            value: value,
                                            pos: token.pos,
                                        });
                                    }
                                    break;
                                case tokenTypes.e_child_js_start:
                                case tokenTypes.e_child_js_end:
                                    node.children.push({
                                        type: token.type,
                                        value: value,
                                        pos: token.pos,
                                    });
                                    break;
                                case tokenTypes.e_child_text:
                                    if (token.value.trim() !== "") {
                                        node.children.push({
                                            type: token.type,
                                            value: token.value,
                                            pos: token.pos,
                                        });
                                    }
                                    break;
                                case tokenTypes.e_child_whitespace:
                                    node.children.push({
                                        type: token.type,
                                        value: token.value,
                                        pos: token.pos,
                                    });
                                    break;
                                case tokenTypes.e_end:
                                    var endName = token.value
                                        .replace("<", "")
                                        .replace("/", "")
                                        .replace(">", "");
                                    if (
                                        endName !== node.name &&
                                        endName !== ""
                                    ) {
                                        throw new Error(
                                            "Found closing element [" +
                                                endName +
                                                "] that does not match opening element [" +
                                                node.name +
                                                "] from Token # " +
                                                token.index +
                                                jsxLoader.compiler.getTextPosition(
                                                    input,
                                                    token.pos,
                                                ),
                                        );
                                    }
                                    breakLoop = true;
                                    e_end_count++;
                                    break;
                                case tokenTypes.e_start:
                                    // Handle nested elements here with a recursive call to walk()
                                    current--;
                                    node.children.push({
                                        type: tokenTypes.e_start,
                                        value: walk(stackCount + 1),
                                        pos: token.pos,
                                    });
                                    break;
                                default:
                                    console.log(tokens);
                                    console.log(ast);
                                    throw new Error(
                                        "Tokens are out of order 1: [" +
                                            token.type +
                                            "], Token #: " +
                                            token.index +
                                            jsxLoader.compiler.getTextPosition(
                                                input,
                                                token.pos,
                                            ),
                                    );
                            }
                            if (breakLoop) {
                                break;
                            }
                        }
                        return node;
                    } else if (
                        token.type === tokenTypes.e_child_js_start &&
                        token.type === startingToken
                    ) {
                        var nodes = [token];
                        while (current < tokenCount) {
                            token = tokens[current];
                            current++;
                            switch (token.type) {
                                case tokenTypes.e_start:
                                    current--;
                                    nodes.push(walk(stackCount + 1));
                                    break;
                                case tokenTypes.e_child_js_end:
                                    nodes.push(token);
                                    return nodes;
                                default:
                                    throw new Error(
                                        "Found unexpected token type in JS child prop: [" +
                                            token.type +
                                            "], Token #: " +
                                            token.index +
                                            jsxLoader.compiler.getTextPosition(
                                                input,
                                                token.pos,
                                            ),
                                    );
                            }
                        }
                    }

                    throw new Error(
                        "Tokens are out of order 2: [" +
                            token.type +
                            "], Token #: " +
                            token.index +
                            jsxLoader.compiler.getTextPosition(
                                input,
                                token.pos,
                            ),
                    );
                } // walk()

                for (var n = 0; n < tokenCount; n++) {
                    tokens[n].index = n;
                }

                while (current < tokenCount) {
                    ast.body.push(walk(0));
                }

                // Checking opening and closing tag count.
                // Because jsxLoader is a minimal JSX compiler and not a full JS compiler
                // it is unable to determine the error location in code for this type of error.
                // To avoid this develop using a IDE such as VS Code that highlights errors in code.
                if (e_start_count !== e_end_count) {
                    throw new Error(
                        'The number of opening elements (for example: "<div>") does not match the number closing elements ("</div>").',
                    );
                }
                return ast;
            },

            /**
             * Compiler Step 4 (Code Generation) - Convert AST to Code.
             *
             * Often compilers will include additional steps in-between the original AST
             * and Code Generation such as converting to a different AST format or optimizing.
             * For example the [The Super Tiny Compiler] which this script used as a starting
             * point includes extra functions `traverser()` and `transformer()`. This function
             * combines the steps because most AST nodes are kept (only some whitespace is
             * dropped and the logic is relatively simple). By combining transformation and
             * code generation only a single iteration is needed over the original AST is
             * performed and only one copy of the AST is made.
             *
             * @param {object} ast
             * @param {string} input
             * @return {string}
             */
            codeGenerator: function (ast, input) {
                var addUseStrict = this.addUseStrict;

                // Default to use `React.createElement`, however if a code hint for
                // Babel is found such as `// @jsx preact.createElement` then use
                // the `createElement()` function from the code hint.
                var createElement = this.pragma;
                var regex = /(\/\/|\/\*|\/\*\*)\s+@jsx\s+([a-zA-Z.]+)/gm;
                var match = regex.exec(input);
                if (match) {
                    createElement = match[2];
                }
                return generateCode(ast);

                // Recursive private function for generating code
                function generateCode(node, skipIndent) {
                    switch (node.type) {
                        case astTypes.program:
                            var generatedJs = node.body
                                .map(generateCode)
                                .join("");
                            // By default if 'use strict' is not found then add it to the start of the generated code.
                            // This can be turned off by setting `jsxLoader.compiler.addUseStrict = false`;
                            if (
                                addUseStrict &&
                                generatedJs.indexOf('"use strict"') === -1 &&
                                generatedJs.indexOf("'use strict'") === -1
                            ) {
                                return '"use strict";\n' + generatedJs;
                            }
                            return generatedJs;
                        case astTypes.js:
                        case tokenTypes.e_child_js_start:
                        case tokenTypes.e_child_js_end:
                            return node.value;
                        case astTypes.createElement:
                            // Start of Element
                            var js =
                                createElement +
                                "(" +
                                (node.isClass
                                    ? node.name
                                    : JSON.stringify(node.name)) +
                                ", ";
                            if (node.stackCount > 0) {
                                if (skipIndent !== true) {
                                    js =
                                        "\n" +
                                        " ".repeat(8) +
                                        " ".repeat(node.stackCount * 4) +
                                        js;
                                } else {
                                    js = " " + js;
                                }
                            }
                            // Add Element Props
                            var propCount = node.props.length;
                            var propName;
                            var propJs = [];
                            if (propCount === 0) {
                                js += "null";
                            } else {
                                js += "{";
                                for (var n = 0; n < propCount; n++) {
                                    var propValue = node.props[n].value;
                                    if (propValue === null) {
                                        propValue = "true";
                                    } else if (typeof propValue !== "string") {
                                        if (
                                            Array.isArray(propValue) &&
                                            propValue.length > 0 &&
                                            propValue[0].type ===
                                                tokenTypes.e_child_js_start
                                        ) {
                                            var value2 = "";
                                            while (propValue.length > 0) {
                                                value2 += generateCode(
                                                    propValue.shift(),
                                                    true,
                                                );
                                            }
                                            propValue = value2;
                                        } else {
                                            propValue = generateCode(
                                                propValue,
                                                true,
                                            );
                                        }
                                    }
                                    propName = node.props[n].name.trim();
                                    if (propName.indexOf("-") !== -1) {
                                        propName = JSON.stringify(propName);
                                    }
                                    if (
                                        propValue === "true" &&
                                        /{\.\.\.(.+)}/.test(propName)
                                    ) {
                                        // Handle spread operators: `{...props}`
                                        propJs.push(
                                            propName
                                                .substring(
                                                    0,
                                                    propName.length - 1,
                                                )
                                                .substring(1) +
                                                (n === propCount - 1
                                                    ? ""
                                                    : ", "),
                                        );
                                    } else {
                                        propJs.push(
                                            propName +
                                                ": " +
                                                propValue +
                                                (n === propCount - 1
                                                    ? ""
                                                    : ", "),
                                        );
                                    }
                                }
                                var propTextLen = propJs.reduce(function (
                                    total,
                                    item,
                                ) {
                                    return (total += item.length);
                                }, 0);
                                if (propTextLen > 80) {
                                    var propIndent = "\n";
                                    if (skipIndent !== true) {
                                        propIndent +=
                                            " ".repeat(12) +
                                            " ".repeat(node.stackCount * 4);
                                    }
                                    js += propIndent + propJs.join(propIndent);
                                } else {
                                    js += propJs.join("");
                                }
                                js += "}";
                            }
                            // Add Element Children
                            var childJs = [];
                            var hasChildText = false;
                            var hasChildJs = false;
                            var hasChildEl = false;
                            var startsWithJs = false;
                            var childCount = node.children.length;
                            var lastIndex = null;
                            var childElCount = 0;
                            var lastElAddedAsJs = false;
                            var nodeValue;
                            var allChildJsContainsExpressions = true;
                            var m;
                            // First see what types of child nodes exist
                            for (m = 0; m < childCount; m++) {
                                switch (node.children[m].type) {
                                    case tokenTypes.e_child_js:
                                    case tokenTypes.e_child_js_start:
                                        hasChildJs = true;
                                        nodeValue = node.children[m].value;
                                        // This is not an exact match based on JS syntax but rather
                                        // a quick check that will work for most JSX code.
                                        if (
                                            typeof nodeValue === "string" &&
                                            nodeValue.indexOf("(") === -1 &&
                                            nodeValue.indexOf(")") === -1
                                        ) {
                                            allChildJsContainsExpressions = false;
                                        }
                                        break;
                                    case tokenTypes.e_child_text:
                                        hasChildText = true;
                                        break;
                                    case tokenTypes.e_start:
                                        hasChildEl = true;
                                        childElCount++;
                                        break;
                                    case tokenTypes.e_child_whitespace:
                                    case tokenTypes.e_child_js_end:
                                        break; // Ignore, no need to count or track
                                    default:
                                        throw new Error(
                                            "Unhandled child type codeGenerator(): " +
                                                node.children[m].type,
                                        );
                                }
                            }
                            for (m = 0; m < childCount; m++) {
                                switch (node.children[m].type) {
                                    case tokenTypes.e_child_js:
                                    case tokenTypes.e_child_js_start:
                                        if (lastElAddedAsJs) {
                                            childJs[childJs.length - 1] +=
                                                node.children[m].value;
                                        } else {
                                            childJs.push(
                                                node.children[m].value,
                                            );
                                            if (
                                                !startsWithJs &&
                                                childJs.length === 1
                                            ) {
                                                startsWithJs = true;
                                            }
                                        }
                                        break;
                                    case tokenTypes.e_child_text:
                                        nodeValue = node.children[m].value;
                                        if (nodeValue.indexOf("&") !== -1) {
                                            // Use the browser DOM to convert from HTML to Text if the node might contain
                                            // HTML encoded characters. Example: [&amp;] or [&#039;]
                                            var tmp =
                                                document.createElement("div");
                                            tmp.innerHTML = nodeValue;
                                            nodeValue = tmp.textContent;
                                        }
                                        if (childCount === 1) {
                                            childJs.push(
                                                JSON.stringify(nodeValue),
                                            );
                                        } else if (m === childCount - 1) {
                                            childJs.push(
                                                JSON.stringify(
                                                    nodeValue.replace(
                                                        /\s+$/,
                                                        "",
                                                    ),
                                                ),
                                            ); // trimEnd();
                                        } else if (m === 0) {
                                            childJs.push(
                                                JSON.stringify(
                                                    nodeValue.replace(
                                                        /^\s+/,
                                                        "",
                                                    ),
                                                ),
                                            ); // trimStart()
                                        } else {
                                            childJs.push(
                                                JSON.stringify(nodeValue),
                                            );
                                        }
                                        break;
                                    case tokenTypes.e_child_js_end:
                                        childJs.push(node.children[m].value);
                                        break;
                                    case tokenTypes.e_start:
                                        var skipElIndent = false;
                                        var addedAsJs = false;
                                        if (lastIndex !== null) {
                                            skipElIndent =
                                                node.children[lastIndex]
                                                    .type ===
                                                tokenTypes.e_child_js;
                                        }
                                        if (skipElIndent) {
                                            var lastValue =
                                                node.children[
                                                    lastIndex
                                                ].value.trim();
                                            if (
                                                lastValue.endsWith("&&") ||
                                                lastValue.endsWith("?") ||
                                                lastValue.endsWith("(") ||
                                                lastValue.endsWith(":") ||
                                                lastValue.endsWith(" return")
                                            ) {
                                                childJs[childJs.length - 1] +=
                                                    generateCode(
                                                        node.children[m].value,
                                                        skipElIndent,
                                                    );
                                                addedAsJs = true;
                                                childElCount--;
                                                lastElAddedAsJs = true;
                                            }
                                        }
                                        if (!addedAsJs) {
                                            childJs.push(
                                                generateCode(
                                                    node.children[m].value,
                                                    skipElIndent,
                                                ),
                                            );
                                            lastElAddedAsJs = false;
                                        }
                                        break;
                                    case tokenTypes.e_child_whitespace:
                                        if (
                                            (hasChildJs || hasChildText) &&
                                            !(m === 0 || m === childCount - 1)
                                        ) {
                                            childJs.push(
                                                JSON.stringify(
                                                    node.children[m].value,
                                                ),
                                            );
                                            lastElAddedAsJs = false;
                                        }
                                        continue;
                                    default:
                                        throw new Error(
                                            "Unhandled child type codeGenerator(): " +
                                                node.children[m].type,
                                        );
                                }
                                lastIndex = m; // Skipped when [e_child_whitespace]
                            }
                            if (childJs.length > 0) {
                                if (
                                    !hasChildText &&
                                    hasChildJs &&
                                    hasChildEl &&
                                    startsWithJs &&
                                    childElCount === 1 &&
                                    allChildJsContainsExpressions
                                ) {
                                    js += ", " + childJs.join("");
                                } else {
                                    js += ", " + childJs.join(", ");
                                }
                            }
                            js += ")";
                            return js;
                        default:
                            throw new TypeError(
                                "Unhandled AST type in codeGenerator: " +
                                    node.type,
                            );
                    }
                }
            },
        },
    };

    /**
     * Add Build Version
     * For new releases this gets updated automatically by [scripts/build.js].
     */
    Object.defineProperty(jsxLoader, "version", {
        value: "5.14.3",
        enumerable: true,
    });

    /**
     * Optional Node Support. Additionally if using webpack or a bundler is being used
     * and only compiling is needed lower-level API settings can be used to prevent
     * this script from checking if it needs to download polyfills or babel.
     *
     * https://github.com/dataformsjs/dataformsjs/issues/16
     */
    var isBrowser =
        typeof window !== "undefined" && typeof window.document !== "undefined";
    if (
        !isBrowser &&
        typeof module === "object" &&
        typeof module.exports === "object"
    ) {
        module.exports = { jsxLoader: jsxLoader };
        return; // Web Browser is not being used so do not run any setup code below
    }

    /**
     * Assign [jsxLoader] as a global property to the [window] object
     */
    window.jsxLoader = jsxLoader;

    document.addEventListener("DOMContentLoaded", function () {
        jsxLoader.setup();
    });
})();
