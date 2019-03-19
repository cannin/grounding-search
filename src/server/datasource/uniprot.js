const XmlParser = require('../parser/xml-parser');
const _ = require('lodash');
const { INPUT_PATH, UNIPROT_FILE_NAME, UNIPROT_URL } = require('../config');
const { isSupportedOrganism } = require('./organisms');
const db = require('../db');
const path = require('path');
const download = require('./download');
const logger = require('../logger');

const FILE_PATH = path.join(INPUT_PATH, UNIPROT_FILE_NAME);
const ENTRY_NS = 'uniprot';
const ENTRY_TYPE = 'protein';
const ENTRIES_CHUNK_SIZE = 100;

const XML_TAGS = Object.freeze({
  UNIPROT: 'uniprot',
  ENTRY: 'entry',
  PROTEIN: 'protein',
  DB_REFERENCE: 'dbReference',
  ORGANISM: 'organism',
  ACCESSION: 'accession',
  NAME: 'name',
  GENE: 'gene',
  ALTERNATIVE_NAME: 'alternativeName',
  SUBMITTED_NAME: 'submittedName',
  RECOMMENDED_NAME: 'recommendedName',
  FULL_NAME: 'fullName',
  SHORT_NAME: 'shortName'
});

const updateFromFile = function(){
  return new Promise( resolve => {
    let entries = [];
    let process = Promise.resolve();

    const insertChunk = chunk => db.insertEntries( chunk, false );

    const enqueueEntry = entry => {
      entries.push(entry);

      if( entries.length >= ENTRIES_CHUNK_SIZE ){
        return dequeueEntries();
      } else {
        return Promise.resolve();
      }
    };

    const dequeueEntries = () => {
      let chunk = entries;
      entries = [];

      process = process.then( () => insertChunk( chunk ) );

      return process;
    };

    const consumeEntry = entry => {
      const orgId = entry.organism;

      // consider only the supported organisms
      if ( isSupportedOrganism( orgId ) ){
        enqueueEntry(entry);
      }
    };

    const parseXml = () => {
      let tagStack = [];
      let entry;

      // alternative and submitted name objects for current protein,
      // possible properties of these objects are SHORT_NAME and FULL_NAME tag names,
      // these variables are maintained because only one of SHORT_NAME or FULL_NAME
      // will be pushed to proteinNames when the related tag is closed
      let alternativeProtName = {};
      let submittedProtName = {};

      const makeEmptyEntry = () => {
        let proteinNames = [];
        let geneNames = [];
        let namespace = ENTRY_NS;
        let type = ENTRY_TYPE;

        return { proteinNames, geneNames, namespace, type };
      };

      const pushToProtNames = n => {
        entry.proteinNames.push( n );
      };

      const pushToGeneNames = n => {
        entry.geneNames.push( n );
      };

      const setId = id => {
        if ( _.isNil( entry.id ) ) {
          entry.id = id;
        }
      };

      const setName = n => {
        entry.name = n;
      };

      const setOrganism = o => {
        entry.organism = o;
      };

      const getTagAt = index => {
        if ( index < 0 ) {
          index += tagStack.length;
        }

        return _.get( tagStack, index );
      };

      const onopentag = node => {
        let last = node.name;
        let attributes = node.attributes;

        tagStack.push( last );
        let prev1 = getTagAt( -2 );

        if ( last == XML_TAGS.ENTRY && prev1 == XML_TAGS.UNIPROT ) {
          entry = makeEmptyEntry();
        }
        else if ( last == XML_TAGS.DB_REFERENCE && prev1 == XML_TAGS.ORGANISM ) {
          setOrganism( attributes.id );
        }
      };

      const onclosetag = node => {
        let tag = node.name;
        let selectAndPush = obj => {
          let name = obj[XML_TAGS.SHORT_NAME] || obj[XML_TAGS.FULL_NAME];
          if ( !_.isNil( name ) ){
            pushToProtNames( name );
          }
        };

        if ( tag == XML_TAGS.ALTERNATIVE_NAME ) {
          selectAndPush( alternativeProtName );
          alternativeProtName = {};
        }
        else if ( tag == XML_TAGS.SUBMITTED_NAME ) {
          selectAndPush( submittedProtName );
          submittedProtName = {};
        }
        else if ( tag == XML_TAGS.ENTRY ) {
          consumeEntry( entry );
        }

        tagStack.pop();
      };

      const ontext = text => {
        // omit if text is full of white spaces
        if ( /^\s*$/.test(text) ) {
          return;
        }

        let last = getTagAt( -1 );
        let prev1 = getTagAt( -2 );
        let prev2 = getTagAt( -3 );

        let isFullOrShortNameTag =
          tagName => tagName == XML_TAGS.FULL_NAME || tagName == XML_TAGS.SHORT_NAME;

        if (  prev1 == XML_TAGS.ENTRY ) {
          if ( last == XML_TAGS.ACCESSION ) {
            setId( text );
          }
          else if ( last == XML_TAGS.NAME ) {
            setName( text );
          }
        }
        else if ( prev1 == XML_TAGS.GENE && last == XML_TAGS.NAME ) {
          pushToGeneNames( text );
        }
        else if ( prev2 == XML_TAGS.PROTEIN && isFullOrShortNameTag( last ) ) {
          if ( prev1 == XML_TAGS.RECOMMENDED_NAME ) {
            // for RECOMMENDED_NAME both of FULL_NAME and SHORT_NAME must be pushed
            // so no need for checking last tag name here
            pushToProtNames( text );
          }
          else if ( prev1 == XML_TAGS.SUBMITTED_NAME ) {
            submittedProtName[ last ] = text;
          }
          else if ( prev1 == XML_TAGS.ALTERNATIVE_NAME ) {
            alternativeProtName[ last ] = text;
          }
        }
      };

      const onend = () => {
        dequeueEntries(); // last chunk might not be full

        logger.info('Updating index with processed Uniprot data');

        const enableAutoRefresh = () => db.enableAutoRefresh();
        const manualRefresh = () => db.refreshIndex();

        process
          .then( () => logger.info('Finished updating Uniprot data') )
          .then( enableAutoRefresh )
          .then( manualRefresh )
          .then( resolve );
      };

      XmlParser( FILE_PATH, { onopentag, onclosetag, ontext, onend } );
    };

    const guaranteeIndex = () => db.guaranteeIndex();
    const disableAutoRefresh = () => db.disableAutoRefresh();
    const clearNamespace = () => db.clearNamespace(ENTRY_NS);
    
    guaranteeIndex()
      .then( clearNamespace )
      .then( disableAutoRefresh )
      .then( parseXml );

    logger.info(`Processing Uniprot data from ${FILE_PATH}`);

  } );
};

const update = function(forceIfFileExists){
  return download(UNIPROT_URL, UNIPROT_FILE_NAME, forceIfFileExists).then(updateFromFile);
};

const clear = function(){
  const refreshIndex = () => db.refreshIndex();
  return db.clearNamespace(ENTRY_NS).then( refreshIndex );
};

const search = function(searchString, from, size){
  return db.search( searchString, ENTRY_NS, from, size );
};

const get = function(id){
  return db.get( id, ENTRY_NS );
};

module.exports = { update, clear, search, get };
