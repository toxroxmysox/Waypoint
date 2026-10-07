/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_617927508")

  // remove field
  collection.fields.removeById("text2719541170")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_617927508")

  // add field
  collection.fields.addAt(14, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2719541170",
    "max": 0,
    "min": 0,
    "name": "zz_probe_450",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
})
