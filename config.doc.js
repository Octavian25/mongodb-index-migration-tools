const data = {
  "source": {
    "uri": "mongodb+srv://username:password@your-atlas-cluster.mongodb.net", // fill this from previous mongodb atlas server
    "dbName": "your_source_database" // fill with source database name from atlas exmaple db_tmnurpsr
  },
  "target": { //dont forget change user and password with real one
    "uri": "mongodb://<user>:<password>@10.8.0.1:27017/?authSource=admin&replicaSet=rs0&retryWrites=true&w=majority&readPreference=secondaryPreferred&directConnection=true",
    "dbName": "db_tmnurpsr" // this is your target database name
  },
  "collections": [], // fill this with collection name if you want to copy index only selected collection
  "customIndexes": [
      // you can add this object if you have custom index to install on target mongodb
      {
          "collectionName": "tm_bank",
          "index": {
            "key": { "kode_bank": 1 },
            "name": "kode_bank_1", // this is index name, it can be anything , but keep it relevan to key
            "unique": true
          }
        },
      {
          "collectionName": "tm_dept",
          "index": {
            "key": { "kode_dept": 1 },
            "name": "kode_dept_1",
            "unique": true
          }
        },
        {
          "collectionName": "tm_gudang",
          "index": {
            "key": { "kode_gudang": 1 },
            "name": "kode_gudang_1",
            "unique": true
          }
        },
        {
          "collectionName": "tt_beli_detail",
          "index": {
            "key": { "no_faktur_beli": 1 },
            "name": "no_faktur_beli_1",
            "unique": true
          }
        },
        {
          "collectionName": "tt_opname",
          "index": {
            "key": { "no_opname": 1, "kode_barcode": 1 }, // this is example if on one index need two key as reff
            "name": "no_opname_1_kode_barcode_1",
            "unique": true
          }
        },
        {
          "collectionName": "tp_jual_counter",
          "index": {
            "key": { "no_faktur_jual": 1 },
            "name": "no_faktur_jual_1",
            "unique": true
          }
        },
        {
          "collectionName": "tm_credit_card_customer",
          "index": {
            "key": { "no_hp": 1 },
            "name": "no_hp_1",
            "unique": true
          }
        },
        {
          "collectionName": "tm_credit_card_customer",
          "index": {
            "key": { "no_credit_card": 1 },
            "name": "no_credit_card_1",
            "unique": true
          }
        },
        {
          "collectionName": "tm_credit_card_customer",
          "index": {
            "key": { "no_ktp": 1 },
            "name": "no_ktp_1",
            "unique": true
          }
        }
  ]
}