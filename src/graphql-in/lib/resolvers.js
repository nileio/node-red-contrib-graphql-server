exports.buildfieldResolvers = (node, RED) => {
  const allresolvers = {},
    bpagination =
      node.schemaConfig.pagination && node.schemaConfig.cursorField.length > 0

  function getdeepName(type) {
    // wrapping types
    return type.name || getdeepName(type.ofType);
  }
  function timeout(promises, ms) {
    const timerPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error("Request Timeout|" + promises[0].for));
      }, ms);
    });
    return Promise.race([timerPromise, ...promises]);
  }
  function edgesSelected(info) {
    //this is possibly immature because there maybe the name "edges" anywhere in the
    //query and it will still return true. but this is better than nothing
    //if no check is made a query might time out if client has not requested "edges" field
    //this is because automating pagination support resolves the "pageInfo" promise at the same time when the "edges" field is resolved.
    const edges = (field) => field.name.value === "edges";
    return info.operation.selectionSet.selections.some((selection) => {
      return selection.selectionSet.selections.some(edges);
    });
  }

  function resolverMsg(parent, args, context, info, node) {
    return new Promise(function (resolve, reject) {
      const typeReturn = node.schemaConfig.getreturnTypeName(info.returnType);
      const msg = {
        graphql: {
          operationName: info.operation.name ? info.operation.name.value : null,
          operationType: info.operation.operation,
          fieldName: info.fieldName,
          parentType: info.parentType.name,
          fieldPath: `${info.parentType.name}.${info.fieldName}`,
          args: args,
          vars: info.variableValues,
          parent: parent
            ? {
              payload: parent,
              fieldPath: info._parent.fieldPath,
              fieldName: info._parent.fieldName,
              parentType: info._parent.parentType,
              args: info._parent.args,
            }
            : undefined,
          root: context.root
            ? {
              fieldPath: context.root.fieldPath,
              args: context.root.args,
              vars: context.root.vars,
            }
            : undefined,
          return: {
            type: getdeepName(info.returnType),
            isAbstract: false,
            isConnection: false,
            isEdge: false,
            isPageInfo: false,
            isArray: typeReturn.dataType === "Array",
            isObject: typeReturn.dataType === "Object",
            typeText: typeReturn.typeName,
            dataType: typeReturn.typeType,
            fields: node.schemaConfig.formatreturnTypeFields(info.returnType),
          },
          config: {
            flowResolvers: node.resolverstype,
            useDataLoader: node.usedataloader,
            pagination:
              node.schemaConfig.pagination &&
              node.schemaConfig.cursorField.length > 0,
            cursorField: node.schemaConfig.cursorField || undefined,
          },
          _resolver: {
            _fieldName: () => info.fieldName,
            _resolve: (result) => {
              resolve(result);
            },
            _reject: (reason) => {
              reject(reason);
            },
            _resolvepage: (result) => {
              if (context.ppromise) context.ppromise._resolve(result);
            },
          },
        },
      };
      msg.graphql.return.isAbstract = node.schemaConfig.isAbstract(
        msg.graphql.return.type
      );
      msg.graphql.return.isConnection =
        msg.graphql.return.typeText.indexOf("Connection") !== -1; // this is a reserved keyword according to pagination specs
      msg.graphql.return.isEdge =
        msg.graphql.return.typeText.indexOf("Edge") !== -1; //Note: this is not used because Edge is NOT a reserverd keyword but its good practice if using this with pagination.
      msg.graphql.return.isPageInfo =
        msg.graphql.return.typeText.indexOf("PageInfo") !== -1; ///this is a reserved keyword according to pagination specs

      // Object.defineProperty(msg.graphql, "_resolver", {
      //   enumerable: false,
      //   value: {
      //     _fieldName: () => info.fieldName,
      //     _resolve: function (result) {
      //       resolve(result);
      //     },
      //     _reject: function (reason) {
      //       reject(reason);
      //     }
      //   }
      // });

      //Expermental : this will immediately resolve any field of type Enum that got a value assuming that Enums are returned in output
      // as just string literals
      // this will only be triggered if requireResolversforallNonScalars is true, or if a resolver exist for an enum type
      if (
        parent &&
        msg.graphql.return.dataType === "Enum" &&
        parent[info.fieldName]
      )
        //TEST : i removed return from below
        resolve(parent[info.fieldName]);

      // context.__graphql.msg = msg;

      // Pagination support - decode after & before params
      // format of cursor is "cursorField==value" base64 encoded.
      if (
        msg.graphql.operationType === "query" &&
        Object.keys(args).length > 0 &&
        bpagination
      ) {
        if (args.hasOwnProperty("after")) {
          msg.graphql.args.after = Buffer.from(args.after, "base64").toString(
            "ascii"
          );
          msg.graphql.args.after = Number(
            msg.graphql.args.after.substring(
              msg.graphql.args.after.indexOf("==") + 2
            )
          );
        }
        if (args.hasOwnProperty("before")) {
          msg.graphql.args.before = Buffer.from(args.before, "base64").toString(
            "ascii"
          );
          msg.graphql.args.before = Number(
            msg.graphql.args.before.substring(
              msg.graphql.args.before.indexOf("==") + 2
            )
          );
        }
      }

      //dispatch message for resolution
      node.send(msg);
    });
  }
  function batchFn(keys) {
    try {
      //group the keys by the requested fieldname
      const promises = Object.entries(keys
        .reduce((acc, c, i) => {
          return (acc[c.request] && acc[c.request].payload.push(c.payload) ||
            (acc[c.request] = {
              request: c.request, args: c.extra.args, context: c.extra.context, info: c.extra.info,
              thisnode: c.extra.thisnode, payload: new Array(c.payload), keys: []
            })) && acc[c.request].keys.push(i) && acc
        }, {}))
        .map(v => {
          delete v[1].context.loaderkeys[v[1].request];
          return resolverMsg(v[1].payload, v[1].args, v[1].context, v[1].info, v[1].thisnode).then(results => {
            //add the original key positions to the results
            results.keys = v[1].keys;
            return results;
          })
        });
      return Promise.all(promises).then(results => {
        // we must ensure that the original order of keys is maintained.
        // using the keys property added for each promise which simply contains the position required in the final results array.
        // we need this only if we split the original promise into more than one
        if (results.length > 1) {
          const positions = results.flatMap(c => c.keys); //contains the original positions
          return results.flat(1).reduce((acc, c, i) => {
            acc[positions[i]] = c;
            return acc;
          }, [])
        }
        else
          //flat depth 1 is needed since we use Promise.all which returns results as an array.
          return results.flat(1)
      })
    } catch (err) {
      // node.error(new Error(err));
      console.error(err.message, err.stack);
      return;
    }
  }

  function getParentfieldPath(path) {
    //TODO: Needs further tests with deep nested paths
    if (path.prev && path.prev.typename)
      return `${path.prev.typename}.${path.prev.key}`;
    else {
      let noprev = path.prev.typename === undefined;
      let prev = path.prev.prev;
      while (noprev) {
        if (prev && prev.typename) return `${prev.typename}.${prev.key}`;
        else if (prev && !prev.typename) prev = prev.prev;
        else noprev = false;
      }
      return `${path.typename}.${path.key}`;
    }
  }

  //this is the core of graphQL ! the resolver function
  function resolvefn(parent, args, context, info) {
    const promises = [],
      thisnode = context.node,
      fieldPath = `${info.parentType.name}.${info.fieldName}`;

    if (!parent) {
      context.root = {
        fieldPath: fieldPath,
        args: args,
        vars: info.variableValues,
      };
      //used when checking for the existence of required fields for pagination object , that is "edges" field
      context.selections = {
        args: { [fieldPath]: args },
      };
    } else {
      info._parent = {
        fieldPath: getParentfieldPath(info.path),
      };
      [info._parent.parentType, info._parent.fieldName] = info._parent.fieldPath.split(".");
      info._parent.args = context.selections.args[info._parent.fieldPath];
      context.selections.args[fieldPath] = args;
    }

    //With Pagination support -- add a special promise for pageInfo (resolved only when edges are resolved)
    //note pageInfo is a reserved keyword if using Pagination Specs support
    if (bpagination && !context.ppromise && info.fieldName === "pageInfo") {
      const ppromise = new Promise(function (resolve, reject) {
        // we cannot promise pageInfo if no edges were selected in the query
        // so we return a default pageInfo
        if (!edgesSelected(info)) {
          return resolve({
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: "",
            endCursor: "",
          });
        } else {
          context.ppromise = {
            _resolve: function (result) {
              resolve(result);
            },
          };
        }
      });
      // @ts-ignore
      ppromise.for = fieldPath;
      promises.push(ppromise);
    }
    // With Dataloader - batch root data and dispatch messages in batch
    else if (parent && context.dataloader && info.fieldName !== "pageInfo") {
      let extra = undefined;
      const recno =
        context.loaderkeys[fieldPath]++ ||
        ((context.loaderkeys[fieldPath] = 1) && (extra = { args, context, info, thisnode }));
      const p = context.dataloader.load({
        request: fieldPath,
        payload: parent,
        extra
      });
      // @ts-ignore
      p.for = fieldPath;
      promises.push(p);
    }
    // Default Without Dataloader  - just dispatch a message
    else {
      const p = resolverMsg(parent, args, context, info, thisnode);
      //useful info when promises are either rejected or timeout.. used in timeout error handling function to return to client
      // @ts-ignore
      p.for = fieldPath;
      promises.push(p);
    }

    return timeout(promises, thisnode.timeout)
      .then((output) => {
        return output;
      })
      .catch((err) => {
        const err_msg = err.message.split("|");
        switch (err_msg[0]) {
          case "Request Timeout":
            const msg = RED._("graphql-in.errors.timeout", {
              fieldPath: err_msg[1],
              timeout: thisnode.timeout / 1000,
            });
            thisnode.error(new Error(msg));
            console.error(msg, err.stack);

            return new Error(
              RED._("graphql-in.errors.timeout_client", {
                fieldPath: err_msg[1],
              })
            );
          default:
            return new Error(err.message);
        }
      });
  }

  // 1. query,mutation resolvers (root opreations)
  node.schemaConfig.getrootOperations().forEach((operation) => {
    const type = node.schemaConfig.getoperationType(operation);
    //subscription resolvers require a subscription server

    const resolvers = Object.keys(
      node.schemaConfig.getoperationFields(operation)
    ).reduce(
      (r, c) =>
        type === "Subscription"
          ? Object.assign(r, { [c]: { resolve: resolvefn } })
          : Object.assign(r, { [c]: resolvefn }),
      {}
    );
    Object.assign(allresolvers, { [type]: resolvers });
  });
  //}
  // will be called for abstract types only.
  //requirement here is abstract types returns must declare their type using __resolveType key with a value correponding to the name of the type
  const resolveType = {
    __resolveType(obj, context, info) {
      if (obj.__resolveType) return obj.__resolveType;
      return null;
    },
  };
  //2. Abstract types (Union & Interface) resolvers
  node.schemaConfig.getabstractTypes().forEach((type) => {
    Object.assign(allresolvers, {
      [type.name]: resolveType,
    });
  });
  //3. field-level resolvers
  let requireResolversForNonScalar = false;
  if (node.resolverstype === "nonscalar") {
    // requireResolversForNonScalar = true;
    //always use the latest deployed schema tree only to avoid any inconsistency
    node.schemaConfig.getclientResolversTree().forEach((parent) => {
      const type = parent.id;
      const typeresolvers = { [type]: {} };
      parent.children.forEach((field) => {
        const fields = field.label.split(":");
        const fieldtype = fields[1].trim();
        //non-scalars do not start with those scalar types. Note Enum is non-scalar type though it can be returned as literal string value
        //expermintal pagination support exclude PageInfo class, and node field resolver
        if (!fieldtype.match(/^String|^Int|^Float|^Boolean|^ID/)) {
          field.selected = true;
          const name = fields[0];
          //FIXME: what happens if someone uses the reserved keyword "node" on a different class and expect to resolve the field!?
          // this is hacky at the moment because the field name "node" is not a reserved fieldname according to Pagination Specs
          //how do we know this node field is the one under "edges" too !?
          //Limitation: when using the automating Pagination Support feature this hack means we should not use the field name "node" anywhere in the schema except in an Edge class.
          //we are here excluding the exact field name "node" from being resolved manually in the flow.
          if (!bpagination || (bpagination && name !== "node"))
            //exluding "node" for pagination support
            Object.assign(typeresolvers[type], { [name]: resolvefn });
        }
      });
      if (Object.keys(typeresolvers[type]).length > 0)
        Object.assign(allresolvers, typeresolvers);
    });
  } else if (node.resolverstype === "selected") {
    requireResolversForNonScalar = false;
    // selected field resolvers
    node.resolvers.forEach((parent) => {
      const type = parent.id;
      const typeresolvers = { [type]: {} };
      parent.children.forEach((field) => {
        if (field.selected) {
          const name = field.label.split(":")[0];
          Object.assign(typeresolvers[type], { [name]: resolvefn });
        }
      });
      if (Object.keys(typeresolvers[type]).length > 0)
        Object.assign(allresolvers, typeresolvers);
    });
  }
  // const istypeOf = {
  //   __isTypeOf: (obj, context, info) => {
  //     if (Array.isArray(obj)) {
  //       if (obj.length > 0) return obj[0].__typename;
  //     } else return obj.__typename;
  //   }
  // };

  // node.schemaConfig.getabstractPossibleTypes().forEach(type => {
  //   type.possibleTypes.forEach(possibleType => {
  //     Object.assign(allresolvers, {
  //       [possibleType]: istypeOf
  //     });
  //   });
  // });

  //this can also be done by executing a query against the schema itself
  //to return any field with non-scalar type along with its parent type.
  return {
    fieldResolvers: allresolvers,
    requireResolversForNonScalar: requireResolversForNonScalar,
    batchFn: batchFn
  };
};
