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
  // require any external libraries we may need....
  const serveStatic = require('serve-static')
  const { parse } = require("graphql");
  const { buildSchema, getIntrospectionQuery } = require("graphql/utilities");
  const { isOutputType, isListType, isObjectType, isNonNullType, isInterfaceType, isUnionType, isCompositeType, isEnumType } = require("graphql/type");
  const path = require("path");
  function GraphQLSchema(n) {
    // Create a RED node
    RED.nodes.createNode(this, n);
    // Store local copies of the node configuration (as defined in the .html)
    //   this.editor = n.editor || false;
    //   this.editorendpoint = n.editorendpoint || "/graphql-schema/editor";

    this.name = n.name || "";
    this.schema = n.schema;
    this.pagination = n.pagination || false;
    this.cursorField = n.cursorField || ""; // cursor field must be a number field for example ROW_ID or RowNum,etc.
    // copy "this" object in case we need it in context of callbacks of other functions.
    const node = this;

    try {
      const _schemaO = buildSchema(`${this.schema}`);

      // console.log(
      //   printIntrospectionSchema(_schemaO, {
      //     commentDescriptions: true
      //   })
      // );
      //console.log(printIntrospectionSchema(_schemaO));
      // console.log(printSchema(_schemaO));
      const _schemaConfig = _schemaO.toConfig();
      const _allschemaOperations = [];

      //  const familyArray = [{ key: ["Marge", "Homer"] }, ["Bart", "Lisa", "Maggie"]];
      const _queryFields = (() => {
        if (_schemaConfig.query) {
          _allschemaOperations.push("query");
          return _schemaConfig.query.getFields();
        }
        return [];
      })();

      const _mutationFields = (() => {
        if (_schemaConfig.mutation) {
          _allschemaOperations.push("mutation");
          return _schemaConfig.mutation.getFields();
        }
        return [];
      })();
      const _subscriptionFields = (() => {
        if (_schemaConfig.subscription) {
          _allschemaOperations.push("subscription");
          return _schemaConfig.subscription.getFields();
        } else return [];
      })();

      this.queryFields = _queryFields;
      this.mutationFields = _mutationFields;
      this.subscriptionFields = _subscriptionFields;
      this.getSchema = function () {
        return _schemaO;
      };
      this.getIntrosepctionAST = function () {
        //return a document from the introspectionquery
        return parse(getIntrospectionQuery());
      };
      this.getrootOperations = function () {
        return _allschemaOperations;
      };
      this.getabstractTypes = function () {
        return _schemaConfig.types.filter(type => isInterfaceType(type) || isUnionType(type));
      };
      this.getabstractPossibleTypes = function () {
        return _schemaConfig.types
          .filter(type => isInterfaceType(type) || isUnionType(type))
          .map(abstractType => {
            return {
              type: abstractType,
              possibleTypes: _schemaO.getPossibleTypes(abstractType).map(posstype => posstype.name)
            };
          });
      };
      const _alloperationTypes = _allschemaOperations.map(op => _schemaConfig[op].name);
      /**
       * Returns all custom GraphQL types from the schema.
       *
       * Parses all object and interface types from the schema and filters out any introspection type and the root operation types.
       * The function returns the filtered list as an array or an object.
       *
       * @param {boolean} [objret=false]   - Determines whether to return an object or an array (default).
       * @return {[string]} List of types in the order it was processed. If returnobj is true, it returns an object with keys being the class names.
       */
      this.getallCustomTypes = function (objret = false) {
        if (objret === true)
          return _schemaConfig.types
            .filter(type => (isObjectType(type) || isInterfaceType(type)) && !type.name.startsWith("__") && !_alloperationTypes.includes(type.name))
            .reduce((r, c) => Object.assign(r, c), {});
        else return _schemaConfig.types.filter(type => (isObjectType(type) || isInterfaceType(type)) && !type.name.startsWith("__") && !_alloperationTypes.includes(type.name));
      };

      this.formattypeFields = function (type) {
        //this could have built by simply parsing the text of the schema using regex to return the name & type if needed
        // but where is the fun in that !.. i choose to confirm my understanding of the schema specs by using 
        // the parsing mechansim of graphql itself and checking on all supported types.
        // performance is not an issue.. this has parsed the whole github graphql schema in no time!
        try {
          return Object.keys(type._fields).map(f => ({
            name: type._fields[f].name,
            type: (function getTypeString(t) {
              switch (true) {
                case isUnionType(t): {
                  return `${t._types.reduce((a, b) => [(typeof a === 'string') ? a : getTypeString(a), (typeof b === 'string') ? b : getTypeString(b)].join("|"))}`;
                }
                case (isListType(t)): {
                  return `[${getTypeString(t.ofType)}]`;
                }
                case (isNonNullType(t)):
                  return `${getTypeString(t.ofType)}!`;
                default:
                  return t.name || getTypeString(t.ofType);
              }
            })(type._fields[f].type),
            description: type._fields[f].description || null,
            arguments: null,
            directives: (type._fields[f].astNode.directives.length > 0 ?
              type._fields[f].astNode.directives.map(d => d.name.value)
              : null),
            isDeprecated: type._fields[f].isDeprecated,
            deprecationReason: type._fields[f].deprecationReason
          }));
        } catch (err) {
          console.log(`formattypeFields: error`, err.message)
        }
      };
      this.formatreturnTypeFields = function (returnType) {

        try {
          if (isOutputType(returnType)) {
            if (isListType(returnType)) return [this.formatreturnTypeFields(returnType.ofType)];
            else if (isEnumType(returnType))
              return returnType.getValues().map(v => ({
                name: v.name,
                value: v.value,
                description: v.description,
                isDeprecated: v.isDeprecated,
                deprecationReason: v.deprecationReason
              }));
            else if (isNonNullType(returnType)) return this.formatreturnTypeFields(returnType.ofType);
            else if (isUnionType(returnType) || isInterfaceType(returnType))
              return _schemaO
                .getPossibleTypes(returnType) //._types
                .reduce((a, b) => [Array.isArray(a) ? a : { [a]: this.formatreturnTypeFields(a) }, Array.isArray(b) ? b : { [b]: this.formatreturnTypeFields(b) }])
                .reduce((r, c) => Object.assign(r, c), {});
            else if (isObjectType(returnType)) return this.formattypeFields(returnType);
            else return returnType.name;
          } else return null;
        } catch (err) {
          console.log(`formatreturnTypeFields: error`, err.message)
        }
      };
      this.isAbstract = function (typeName) {

        try {
          if (isUnionType(_schemaO.getType(typeName)) || isInterfaceType(_schemaO.getType(typeName))) return true;
          else return false;
        } catch (err) {
          console.log(`isAbstract: error`, err.message)
        }
      };
      this.getreturnTypeName = function (returnType) {

        try {
          if (isOutputType(returnType)) {
            if (isListType(returnType)) return { typeType: "Array", typeName: `[${this.getreturnTypeName(returnType.ofType).typeName}]` };
            else if (isEnumType(returnType)) return { typeType: "Enum", typeName: returnType.name };
            else if (isNonNullType(returnType)) return { typeType: "NonNull", typeName: `${this.getreturnTypeName(returnType.ofType).typeName}` };
            else if (isUnionType(returnType))
              return {
                typeType: "Union",
                typeName: `${returnType._types.reduce((a, b) => [typeof a === 'object' ? this.getreturnTypeName(a).typeName : a, typeof b === 'object' ? this.getreturnTypeName(b).typeName : b].join("|"))}`
              };
            else if (isObjectType(returnType)) return { typeType: "Object", typeName: returnType.name };
            else if (isInterfaceType(returnType))
              return {
                typeType: "Object",
                typeName: returnType.name
              };
            else return { typeType: "Unknown", typeName: returnType.name };
          } else return null;
        } catch (err) {
          console.log(`getreturnTypeName: error`, err.message)
        }
      };
      /**
       * Retrieves all custom types and its associated fields from the schema.
       *
       * @param {boolean} [csort=false]   -  Determines whether to sort class keys alphabetcially . Defaults to false.
       * @param {boolean} [fsort=false]   -  Determines whether to sort field keys alphabetically. Defaults to false.
       *
       * @return {Object[]}  An array of objects with each item representing a class and its fields.
       * The object has a "name" and "fields" properties.
       *
       */
      this.getallCustomTypesDictionary = function (csort = false, fsort = false) {
        try {
          let dict = [];
          if (csort === true) dict = this.getallCustomTypes().sort();
          return dict.map(type => {
            return {
              name: type.name,
              description: type.description,
              //TODO : implement a sort functions for fields using the name property
              //fields: fsort ? this.gettypeFields(type).sort() : this.gettypeFields(type)
              fields: this.formattypeFields(type) //(() => {})() //. this.gettypeFields(type)
            };
          });
        } catch (err) {
          console.log(`getallCustomTypesDictionary: error`, err.message)
        }
      };
      this.getclientResolversTree = function () {
        //returns resolvers map in a simplified tree format object : Root-Type-Children
        //the tree object is compatible with the node-red editor tree widget
        // (expanded tree by default and includes checkboxes and no icons included)
        // i use the object also in my server code i cant think of any quicker way for now :)
        try {
          return this.getallCustomTypesDictionary(true).map(type => {
            return {
              id: type.name,
              label: type.name,
              checkbox: true,
              selected: false,
              expanded: true,
              children: type.fields.map(f => {
                return { id: `${type.name}.${f.name}`, label: `${f.name}: ${f.type}`, checkbox: true, selected: false };
              })
            };
          });
        } catch (err) {
          console.log(`getclientResolversTree: error`, err.message)
        }
      };
      /**
       * Retrieve the Graphql type name for the given root operation.
       *
       * @param {String} op     The name of the operation, one of : "query", "mutation" or "subscription".
       *
       * @return {string} the name of the type as a string.
       */
      this.getoperationType = function (op) {
        return _schemaConfig[op].name;
      };
      this.getoperationFields = function (op) {
        switch (op) {
          case "query":
            return this.queryFields;
          case "mutation":
            return this.mutationFields;
          case "subscription":
            return this.subscriptionFields;
          default:
            return [];
        }
      };
    } catch (err) {
      node.error(RED._("graphql-schema.errors.invalidschema", { name: node.name }));
      console.log(err);
    }
  }
  const editor = RED.settings.graphqlSchema && RED.settings.graphqlSchema.editor ? RED.settings.graphqlSchema.editor : false;

  RED.nodes.registerType("graphql-schema", GraphQLSchema, {
    settings: {
      graphqlSchemaSettings: {
        value: {
          editor: editor,
          uiPort: RED.settings.uiPort,
          uiHost: RED.settings.uiHost,
          https: RED.settings.requireHttps,
          httpAdminRoot: RED.settings.httpAdminRoot
        },
        exportable: true
      }
    }
  });

  if (editor) {
    //the route does not need to be modified while NR is running, so .use is safe here.
    RED.httpAdmin.use("/graphql-schema/editor", serveStatic(path.join(__dirname, "editor")));
  }
  //note. no auth middleware on this route because browser will not pass auth info to admin route. the admin route will not be exposed outside of node-red host.
  // TODO: test
  RED.httpAdmin.get("/graphql-schema/schema", function (req, res, next) {
    const id = req.query.id;
    if (id) {
      const node = RED.nodes.getNode(id);
      if (node !== null && node.type === "graphql-schema") {
        res.send(node.schema);
      } else res.sendStatus(404); //.send("Not found");
    } else res.sendStatus(400);
  });

  RED.httpAdmin.post("/graphql-schema/operations/:id", RED.auth.needsPermission("graphql-schema.read"), function (req, res) {
    //  ** be aware that if a new schema is created and not yet deployed the below will
    // ** return null.
    const node = RED.nodes.getNode(req.params.id);
    if (node !== null && node.type === "graphql-schema") {
      try {
        res.status(200).send(node.getrootOperations());
      } catch (err) {
        res.sendStatus(500);
        node.error(RED._("graphql-schema.errors.internalerror", { error: err.toString() }));
      }
    } else {
      // FIXME: node is null if the node cannot be retrieved because either it is missing
      // or the config node has an error (currently the config node still gets deployed though all ops will fail)
      // we need a validate schema function
      res.status(404).send([]);
      //   node.error(RED._("graphql-schema.errors.missingconfig", { id: req.params.id }));
    }
  });
  RED.httpAdmin.post("/graphql-schema/types/:id", RED.auth.needsPermission("graphql-schema.read"), function (req, res) {
    //  ** if a new schema is created and not yet deployed the below will
    // ** return null.
    const node = RED.nodes.getNode(req.params.id);
    if (node != null && node.type === "graphql-schema") {
      try {
        if (Object.hasOwnProperty.call(node, "getclientResolversTree")) res.status(200).send(node.getclientResolversTree());
        else res.status(200).send([]);
      } catch (err) {
        res.sendStatus(500);
        node.error(RED._("graphql-schema.errors.internalerror", { error: err.toString() }));
      }
    } else {
      res.status(200).send([]);
      //  node.error(RED._("graphql-schema.errors.missingconfig", { id: req.params.id }));
    }
  });
  RED.httpAdmin.post("/graphql-schema/schemachanged/:id", RED.auth.needsPermission("graphql-schema.read"), function (req, res) {
    const node = RED.nodes.getNode(req.params.id);
    if (!req.body.text) res.status(500).send("missing schema text.");
    if (node != null && node.type === "graphql-schema") {
      try {
        const schematext = node.schema.replace(/\s+/g, "");
        res.status(200).send(schematext.length !== req.body.text.length);
      } catch (err) {
        res.sendStatus(500);
        node.error(RED._("graphql-schema.errors.internalerror", { error: err.toString() }));
      }
    } else {
      res.status(200).send(false);
      //  node.error(RED._("graphql-schema.errors.missingconfig", { id: req.params.id }));
    }
  });
  RED.httpAdmin.post("/graphql-schema/schemavalid/", RED.auth.needsPermission("graphql-schema.read"), function (req, res) {
    if (!req.body.text) res.status(500).send("missing schema text.");
    try {
      if (buildSchema(req.body.text)) res.status(200).send(true);
    } catch (err) {
      res.sendStatus(200).send(false);
    }
  });
};

