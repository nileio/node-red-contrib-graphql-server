# node-red-contrib-graphql-server

A set of nodes for <a href="http://nodered.org" target="_new">Node-RED</a> to run a local GraphQL Server.
The server uses the javascript reference implementation of the GraphQL specification.

## Install

To install the stable version use the Menu - Manage palette option and search for node-red-contrib-graphql-server ,
or Run the following command in your Node-RED user directory - typically `~/.node-red`

Note: Requries NodeJs version 11.15 or higher

    npm install node-red-contrib-graphql-server --engine-strict

## Usage

This node bundle helps you build a fully functional GraphQL Server for your application. It uses the approach of Schema-First and delegates resolution of the queries to Node-RED flows. The bundle includes 3 nodes which together provide a full implementation
of GraphQL specifications:

- graphql-in : Creates a GraphQL server endpoint at the defined path supporting both query and mutation operations. The endpoint serves both <code>GET</code> and <code>POST</code> requests by default.</p>
- graphql-out: Sends responses back for requests recieved from a GraphQL In node.
- graphql-schema: Configuration to define a GraphQL schema.
- graphql-subscriptionserver : a graphql subscription server implementation using PubSub

## Summary of features

- uses Node-RED httpNode which means it inherits any middlewares, security,etc. you may have.

- includes an option to use [Dataloader](https://github.com/graphql/dataloader) which enables efficient query implementation for nested operations inherent to any GraphQL server.

- there are 3 modes to choose from to determine how your flow resolves queries. Please read the docs to understand the differences.

- includes a build of [GraphQL Schema Visual editor](https://github.com/graphql-editor/graphql-editor) in order to design a GraphQL schemas using a visual tool. The tool generates a schema which can be used in the node . (I may remove the tool in future versions!)
- includes a link to visualise the schema using [GraphQL Voyager](https://github.com/APIs-guru/graphql-voyager). Note, it serves GraphQL Voyager from CDN which requires a live internet connection.

- includes a [GraphQL Playground](https://github.com/graphql/graphql-playground) (previously I used GraphiQL) - the Playground enables you to test your query, mutation operations and interact with the server. The Playground also supports subscriptions!

- Experimental feature to automatically resolve Pagination in the schema. This is supporting the unofficial [GraphQL Cursor Pagination Specs](https://relay.dev/graphql/connections.htm)

- Subscription Server implementation based on [graphql-subscriptions](https://github.com/apollographql/graphql-subscriptions) using MQTT for PubSub which means you can use the out of box MQTT nodes with it. You can also use any GraphQL subscription client.

- The data sent from the node in `msg.graphql` includes everything you may need to resolve the query such as operation details, result of previous query, arguments passed to the query, reference to the root of the query,etc.

## How to use it

1. Define a GraphQL schema using GraphQL Schema Language. If you are new to GraphQL use the included Visual [GraphQL-Editor](https://github.com/graphql-editor/graphql-editor) and it will generate a schema for you. Start by a simple schema.
   A simple schema might look like this:

```
type Query{
	posts : [Post!]
}

type Post{
	id : ID!
	title : String!
	body : String!
}
schema{
	query: Query
}
```

2. Configure how you plan to resolve the queries and mutations, and decide whether to use [Dataloader](https://github.com/graphql/dataloader)

3. Depending on what you choose for Resolvers mode and create flows which resolves your operations. Resolvers mode controls what messages will be sent to the output port of the GraphQL In node. The flow typically starts with a Switch node which branches out to each type of operation to resolve. There are many fields sent with the message to help you determine how to return the data in `msg.graphql`. It is completely up to you to define the flow resolving the operations. The resolvers flow typically interacts with a backend database , or retrieve data from external services and returns the results back to clients.

4. Return the results to client using GraphQL Out node.

## Example flow

The example flow comes from the original Facebook Starwars implementation and using data from [swapi](https://swapi.dev/).

![Starwars Flow](https://raw.githubusercontent.com/nileio/node-red-contrib-graphql-server/master/examples/starwars_flow.png)

You can find the example flow in the examples folder of the node. Import the example from Node-RED using the Import function or
Copy the below example flow below

````
[{"id":"b97ca9cc.1d71d8","type":"graphql-in","z":"45220d0b.f233a4","path":"/graphql","method":"getandpost","schema":"6c0760fa.703ea","graphi":true,"timeout":"20000","resolverstype":"nonscalar","resolvers":[],"usedataloader":true,"useSubscriptionServer":true,"subscriptionsPath":"/subscriptions","name":"","x":215,"y":300,"wires":[["a4bcf985.7948b8"]]},{"id":"3dbeb01f.1859e","type":"graphql-out","z":"45220d0b.f233a4","name":"","output":"payload","outputType":"msg","returnformat":"nochange","return":"asis","returnarrayindx":0,"x":1025,"y":475,"wires":[]},{"id":"7596de41.2034e","type":"link out","z":"45220d0b.f233a4","name":"","links":["a04aa07d.67b8b"],"x":1000,"y":335,"wires":[]},{"id":"a04aa07d.67b8b","type":"link in","z":"45220d0b.f233a4","name":"","links":["7596de41.2034e"],"x":295,"y":520,"wires":[["3ef20979.6e3026"]]},{"id":"2e9bddfa.e0a1a2","type":"graphql-out","z":"45220d0b.f233a4","name":"","output":"payload","outputType":"msg","returnformat":"nochange","return":"asis","returnarrayindx":0,"x":1030,"y":550,"wires":[]},{"id":"6f6ceb17.6ac9d4","type":"group","z":"45220d0b.f233a4","name":"download or use starwars data from cache if available","style":{"label":true},"nodes":["f6ff1bb6.dccc38","7c6b8368.3b7e6c","e24e585c.2e2cd8","a4bcf985.7948b8","22963952.9a0156"],"x":324,"y":219,"w":622,"h":162,"info":"try different queries using the Playground\nfor example\n\n```\nquery{\nfilm(id: 4){\n  title\n  director\n  producer\n  characters{\n    name\n    gender\n    height\n    homeworld {\n      name\n      population\n      gravity\n      terrain\n    }\n  }\n  species{\n    name\n    eye_colors\n    language\n  }\n}\n}\n```"},{"id":"f6ff1bb6.dccc38","type":"change","z":"45220d0b.f233a4","g":"6f6ceb17.6ac9d4","name":"","rules":[{"t":"set","p":"url","pt":"msg","to":"\"https://raw.githubusercontent.com/nileio/node-red-contrib-graphql-server/master/examples/starwars_data/\"&$lowercase(graphql.return.type)&\"s\"&\".json\"","tot":"jsonata"}],"action":"","property":"","from":"","to":"","reg":false,"x":560,"y":260,"wires":[["7c6b8368.3b7e6c"]]},{"id":"7c6b8368.3b7e6c","type":"http request","z":"45220d0b.f233a4","g":"6f6ceb17.6ac9d4","name":"","method":"GET","ret":"obj","paytoqs":"ignore","url":"","tls":"","persist":false,"proxy":"","authType":"","x":725,"y":260,"wires":[["e24e585c.2e2cd8"]]},{"id":"e24e585c.2e2cd8","type":"change","z":"45220d0b.f233a4","g":"6f6ceb17.6ac9d4","name":"cache","rules":[{"t":"set","p":"cache[msg.graphql.return.type]","pt":"flow","to":"payload","tot":"msg"}],"action":"","property":"","from":"","to":"","reg":false,"x":870,"y":260,"wires":[["7596de41.2034e"]]},{"id":"a4bcf985.7948b8","type":"switch","z":"45220d0b.f233a4","g":"6f6ceb17.6ac9d4","name":"","property":"$lookup($flowContext(\"cache\"),graphql.return.type)","propertyType":"jsonata","rules":[{"t":"null"},{"t":"nnull"}],"checkall":"true","repair":false,"outputs":2,"x":400,"y":300,"wires":[["f6ff1bb6.dccc38"],["22963952.9a0156"]]},{"id":"22963952.9a0156","type":"change","z":"45220d0b.f233a4","g":"6f6ceb17.6ac9d4","name":"","rules":[{"t":"set","p":"payload","pt":"msg","to":"$lookup($flowContext(\"cache\"),graphql.return.type)","tot":"jsonata"},{"t":"set","p":"usedCached","pt":"msg","to":"true","tot":"bool"},{"t":"set","p":"vb","pt":"msg","to":"[{\"Film\":{\"characters\":\"persons.films\"}}]","tot":"json"}],"action":"","property":"","from":"","to":"","reg":false,"x":570,"y":340,"wires":[["7596de41.2034e"]]},{"id":"cedc6b6d.8da468","type":"group","z":"45220d0b.f233a4","name":"starwars query resolvers","style":{"label":true},"nodes":["f8b88c35.b417f","275d82a5.38c92e","cf1d900f.91c12","f18d54e0.b6c318","208b9510.427b7a","3ef20979.6e3026"],"x":329,"y":394,"w":612,"h":237},{"id":"f8b88c35.b417f","type":"change","z":"45220d0b.f233a4","g":"cedc6b6d.8da468","name":"filter by root args","rules":[{"t":"set","p":"payload","pt":"msg","to":"payload[id=$number($$.graphql.args.id)]","tot":"jsonata"}],"action":"","property":"","from":"","to":"","reg":false,"x":805,"y":435,"wires":[["3dbeb01f.1859e"]]},{"id":"275d82a5.38c92e","type":"change","z":"45220d0b.f233a4","g":"cedc6b6d.8da468","name":"filter by parent object","rules":[{"t":"set","p":"payload","pt":"msg","to":"$exists(graphql.parent.payload.$eval($$.graphql.fieldName))? \t($r:=$type(graphql.parent.payload.$eval($$.graphql.fieldName))=\"array\"?[payload[id in $$.graphql.parent.payload.$eval($$.graphql.fieldName)]]:\tpayload[id in $$.graphql.parent.payload.$eval($$.graphql.fieldName)];\t$exists($r)?$r:{})\t:\t($r:=$type($eval($$.graphql.parent.fieldName))=\"array\"?\t\t[payload[graphql.parent.payload.id in $eval($$.graphql.parent.fieldName)]]:\tpayload[graphql.parent.payload.id in $eval($$.graphql.parent.fieldName)];\t$exists($r)?$r:{})\t\t\t\t\t\t","tot":"jsonata"}],"action":"","property":"","from":"","to":"","reg":false,"x":815,"y":520,"wires":[["2e9bddfa.e0a1a2"]]},{"id":"cf1d900f.91c12","type":"switch","z":"45220d0b.f233a4","g":"cedc6b6d.8da468","name":"Dataloader?","property":"graphql.config.useDataLoader","propertyType":"msg","rules":[{"t":"false"},{"t":"true"}],"checkall":"false","repair":false,"outputs":2,"x":610,"y":560,"wires":[["275d82a5.38c92e"],["f18d54e0.b6c318"]]},{"id":"f18d54e0.b6c318","type":"change","z":"45220d0b.f233a4","g":"cedc6b6d.8da468","name":"filter by parent array","rules":[{"t":"set","p":"payload","pt":"msg","to":"$exists(graphql.parent.payload.$eval($$.graphql.fieldName))? \t$map(graphql.parent.payload,function($v,$i){\t($r:=$$.graphql.return.isArray?[payload[id in $v.$eval($$.graphql.fieldName)]]:payload[id in $v.$eval($$.graphql.fieldName)];\t$exists($r)?$r:{})\t})\t\t:\t$map(graphql.parent.payload,function($v,$i){\t\t($r:=$type($eval($$.graphql.parent.fieldName))=\"array\"?\t\t[payload[$v.id in $eval($$.graphql.parent.fieldName)]]:\tpayload[$v.id in $eval($$.graphql.parent.fieldName)];\t$exists($r)?$r:{})\t\t})\t","tot":"jsonata"},{"t":"set","p":"payload","pt":"msg","to":"$count(graphql.parent.payload)>1?[payload]:[[payload]]","tot":"jsonata"}],"action":"","property":"","from":"","to":"","reg":false,"x":815,"y":590,"wires":[["2e9bddfa.e0a1a2"]]},{"id":"208b9510.427b7a","type":"switch","z":"45220d0b.f233a4","g":"cedc6b6d.8da468","name":"args?","property":"graphql.args","propertyType":"msg","rules":[{"t":"hask","v":"id","vt":"str"},{"t":"else"}],"checkall":"false","repair":false,"outputs":2,"x":595,"y":470,"wires":[["f8b88c35.b417f"],["3dbeb01f.1859e"]]},{"id":"3ef20979.6e3026","type":"switch","z":"45220d0b.f233a4","g":"cedc6b6d.8da468","name":"Root Query?","property":"graphql.isRoot","propertyType":"msg","rules":[{"t":"true"},{"t":"false"}],"checkall":"false","repair":false,"outputs":2,"x":425,"y":520,"wires":[["208b9510.427b7a"],["cf1d900f.91c12"]]},{"id":"6c0760fa.703ea","type":"graphql-schema","name":"Star Wars","schema":"type Query{\n\tperson(\n\t\tid : ID!\n\t) : Person\n\tpeople(\n\t\tlimit : Int\n\t) : [Person!]!\n\tfilm(\n\t\tid : ID!\n\t) : Film\n\tfilms(\n\t\tlimit : Int\n\t) : [Film!]!\n\tstarship(\n\t\tid : ID!\n\t) : Starship\n\tstarships(\n\t\tlimit : Int\n\t) : [Starship!]!\n\tvehicle(\n\t\tid : ID!\n\t) : Vehicle\n\tvehicles(\n\t\tlimit : Int\n\t) : [Vehicle!]!\n\tspecie(\n\t\tid : ID\n\t) : Specie\n\tspecies(\n\t\tlimit : Int\n\t) : [Specie!]!\n\tplanet(\n\t\tid : ID!\n\t) : Planet\n\tplanets(\n\t\tlimit : Int\n\t) : [Planet!]!\n}\n\n#A Person is an individual person or \n#character within the Star Wars universe.\ntype Person{\n\tid : ID!\n\tbirth_year : String!\n\teye_color : String!\n\tfilms : [Film!]\n\tgender : String!\n\thair_color : String!\n\theight : Float!\n\thomeworld : Planet\n\tmass : String!\n\tname : String!\n\tskin_color : String!\n\tcreated : DateTime!\n\tedited : DateTime!\n\tspecies : [Specie]\n\tstarships : [Starship!]\n\tvehicles : [Vehicle!]\n}\n\ntype Film{\n\tid : ID!\n\tcharacters : [Person!]\n\tcreated : DateTime!\n\tdirector : String!\n\tedited : DateTime!\n\tepisode_id : ID!\n\topening_crawl : String!\n\tplanets : [Planet!]\n\tproducer : String!\n\trelease_date : DateTime!\n\tspecies : [Specie!]\n\tstarships : [Starship!]\n\ttitle : String!\n\tvehicles : [Vehicle!]\n}\n\nscalar DateTime\n\ntype Planet{\n\tid : ID!\n\tclimate : String!\n\tcreated : DateTime!\n\tdiameter : String!\n\tedited : DateTime!\n\tfilms : [Film!]\n\tgravity : String!\n\tname : String!\n\torbital_period : String!\n\tpopulation : String!\n\tresidents : [Person!]\n\trotation_period : String!\n\tsurface_water : String!\n\tterrain : String!\n\tspecies : [Specie!]\n}\n\ntype Specie{\n\tid : ID!\n\taverage_height : String!\n\taverage_lifespan : String!\n\tclassification : String!\n\tcreated : DateTime!\n\tdesignation : String!\n\tedited : DateTime!\n\teye_colors : String!\n\thair_colors : String!\n\thomeworld : Planet\n\tlanguage : String!\n\tname : String!\n\tpeople : [Person!]\n\tfilms : [Film!]\n\tskin_colors : String!\n}\n\ntype Starship{\n\tid : ID!\n\tMGLT : String!\n\tcargo_capacity : String!\n\tconsumables : String!\n\tcost_in_credits : String!\n\tcreated : DateTime!\n\tcrew : String!\n\tedited : DateTime!\n\thyperdrive_rating : String\n\tlength : String!\n\tmanufacturer : String!\n\tmax_atmosphering_speed : String!\n\tmodel : String!\n\tname : String!\n\tpassengers : String!\n\tfilms : [Film!]\n\tpilots : [Person!]\n\tstarship_class : String!\n}\n\ntype Vehicle{\n\tid : ID!\n\tcargo_capacity : Int!\n\tconsumables : String!\n\tcost_in_credits : String!\n\tcreated : DateTime!\n\tcrew : Int!\n\tedited : DateTime!\n\tlength : String!\n\tmanufacturer : String!\n\tmax_atmosphering_speed : String!\n\tmodel : String!\n\tname : String!\n\tpassengers : Int!\n\tpilots : [Person!]\n\tfilms : [Film!]\n\tvehicle_class : String!\n}\n\ntype Subscription{\n\tnewFilms : Film!\n}\nschema{\n\tquery: Query,\n\tsubscription: Subscription\n}","pagination":false,"cursorField":""}]
````

- I also included another more advanced example which uses a sqlite version of the [chinook database](https://github.com/lerocha/chinook-database)
  The database is located in the example folder of the node. The example flow is a more advanced example using Pagination.
