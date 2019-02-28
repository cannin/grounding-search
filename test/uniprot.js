const chai = require('chai')
  , expect = chai.expect
  , should = chai.should();
const chaiAsPromised = require("chai-as-promised");
const xmljs = require('xml-js');
const fs = require('fs');
const _ = require('lodash');
const uniprot = require('../src/server/datasource/uniprot');
const db = require('../src/server/db');
const { UNIPROT_INDEX, UNIPROT_FILE_NAME, INPUT_PATH } = require('../src/server/config');

// register chai plugin for promises
chai.use( chaiAsPromised );

const loadTestData = () => uniprot.update();
const clearTestData = () => uniprot.clear();
const indexExists = () => db.exists( UNIPROT_INDEX );
const getEntryCount = () => db.count( UNIPROT_INDEX );
const searchGene = geneName => db.search( UNIPROT_INDEX, geneName );

const getXmlEntries = () => {
  let path = INPUT_PATH + '/' + UNIPROT_FILE_NAME;
  let xml = fs.readFileSync( path );
  let json = xmljs.xml2js(xml, {compact: true});
  let entries = _.get( json, ['uniprot', 'entry'] );

  return entries;
};

describe('Load Data', function(){
  it('load test data', function( done ){
    loadTestData().should.be.fulfilled
      .then( () => indexExists().should.eventually.be.equal( true, 'index is created to load data' ) )
      .then( () => getEntryCount().should.eventually.equal( getXmlEntries().length, 'all entries are saved to database' ) )
      .then( clearTestData )
      .then( () => indexExists().should.eventually.be.equal( false, 'index is deleted' ) )
      .then( () => done(), error => done(error) );
  });
});

describe('Search', function(){
  beforeEach(loadTestData);

  afterEach(clearTestData);

  it('search genes', function( done ){
    let promiseTP53 = searchGene('tp53');
    let promiseTP = searchGene('tp');
    let promiseMDM2 = searchGene('mdm2');
    let promiseMD = searchGene('md');
    let promiseTP53uc = searchGene('TP53');

    Promise.all( [ promiseTP53, promiseTP, promiseMDM2, promiseMD, promiseTP53uc ] )
      .should.be.fulfilled
      .then( ( [resTP53, resTP, resMDM2, resMD, resTP53uc] ) => {
        expect(resTP53.length, 'some tp53 data is found').to.be.above(0);
        expect(resMDM2.length, 'some mdm2 data is found').to.be.above(0);
        expect(resTP53, 'search is case insensitive').to.deep.equal(resTP53uc);
        expect(resTP, 'search results for tp supersets tp53').to.deep.include.members(resTP53);
        expect(resMD, 'search results for md supersets mdm2').to.deep.include.members(resMDM2);
      } )
      .then( () => done(), error => done(error) );
  });
});