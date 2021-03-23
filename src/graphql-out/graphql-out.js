//@ts-check
/*
* Licensed under the MIT License (the "License");
* Copyright (c) 2019 Neil Lyon-S
* and other contributors,
* https://github.com/nileio/node-red-contrib-graphql-nodes

* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:

* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.

* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
**/
module.exports = function (RED) {
  "use strict";

  function GraphQLOut(n) {
    // Create a RED node
    RED.nodes.createNode(this, n);
    // Store local copies of the node configuration (as defined in the .html)
    this.name = n.name;
    this.output = n.output || "payload";
    this.returnformat = n.returnformat;
    this.return = n.return;
    this.returnarrayindx = n.returnarrayindx || 0;

    //   this.schema = n.schema;

    // copy "this" object in case we need it in context of callbacks of other functions.
    const node = this;

    node.on("input", function (msg, send, done) {

      try {
        let results = RED.util.getMessageProperty(msg, node.output);
        let resultsoType = null;
        if (Array.isArray(results)) resultsoType = "Array";
        if (node.returnformat === "jsonstring")
          results = JSON.stringify(msg.payload);
        if (node.returnformat === "jsonobject")
          results = JSON.parse(msg.payload);
        if (node.return === "array" && Array.isArray(results))
          results = results[node.returnarrayindx];
        if (node.return === "forcedarray" && !Array.isArray(results))
          results = [results];
        if (msg.graphql.return.dataType === "Array" && resultsoType !== "Array")
          node.warn(
            `the return data type for the ${msg.graphql.operationType} operation ${msg.graphql.fieldName} should be an array , however, returned results is not an array.`
          );

        //pagination support
        if (msg.graphql.fieldName === 'edges' && msg.graphql.config.pagination)
          if (Array.isArray(results)) {
            results = results.map((r) => ({
              node: r,
              cursor: Buffer.from(
                `${msg.graphql.config.cursorField}==${
                r[msg.graphql.config.cursorField]
                }`
              ).toString("base64"),
            }));
            const totalCount = msg.graphql.config.useDataLoader ? msg.graphql.parent.payload[0].totalCount || 0 : msg.graphql.parent.payload.totalCount || 0;
            if (results.length > 0) {
              const pageInfo = {
                startCursor: results[0].cursor,
                endCursor: results[results.length - 1].cursor,
              };
              //FIXME: logic for hasNextPage & hasPreviousPage cannot be determined from totalCount alone?
              // if no first or no last then hasNextPage & hasPreviousPage must be false
              // if after only hasNextPage must be false, and hasPreviousPage must be true because the after cursor means > which denotes that a previous must exist
              // if after and before both hasNext and hasPrvious must be true
              // if before only hasNextPage must be true and hasPrevious must be false
              // if after and first then hasPrevious must be true, and hasNext cannot be determined ! false if total=size but true/false if not
              // if last only hasNext is false and hasPrevious is true if less than total otherwise false
              // if first only hasPrevious is false and hasNext is true if less than total otherise false
              pageInfo.hasNextPage = totalCount > results.length && results[results.length - 1].node[msg.graphql.config.cursorField] !== pageInfo.endCursor
              pageInfo.hasPreviousPage = results[0].node[msg.graphql.config.cursorField] - 1 >= 1 && results[0].node[msg.graphql.config.cursorField] !== pageInfo.startCursor
              msg.graphql._resolver._resolvepage(pageInfo)
            } else {
              msg.graphql._resolver._resolvepage({ hasNextPage: false, hasPreviousPage: false, startCursor: "", endCursor: "" })
            }
            if (msg.graphql.config.useDataLoader)
              results = [results]


          }

        msg.graphql._resolver._resolve(results);

        if (done) {
          done();
        }
      } catch (err) {
        node.error(
          `${RED._("graphql-in.errors.returnerror")} \n${err.message}`
        );
      }
    });
  }
  RED.nodes.registerType("graphql-out", GraphQLOut);
};
