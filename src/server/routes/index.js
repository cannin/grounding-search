import express from 'express';
import { uniprot } from '../datasource/uniprot';
import { chebi } from '../datasource/chebi';
import { ncbi } from '../datasource/ncbi';
import { aggregate } from '../datasource/aggregate';

const router = express.Router();

const dsNsMap = new Map([
  ['ncbi', ncbi],
  ['chebi', chebi],
  ['uniprot', uniprot],
  ['aggregate', aggregate]
]);

const getDataSource = ns => dsNsMap.get(ns);

const handleReq = (source, req, res) => {
  const q = req.body.q;
  const orgCounts = req.body.organismCounts;

  source.search(q, orgCounts).then(searchRes => res.json(searchRes));
};

/* GET home page. */
router.get('/', function(req, res) {
  res.redirect('/api/docs');
});

/**
 * @swagger
 * /uniprot:
 *   post:
 *     description: uniprot search service
 *     tags:
 *       - grounding-search
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: q
 *         description: Search text
 *         in: formData
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Uniprot get query results
 */
// e.g. POST /uniprot { q: 'p53' }
router.post('/uniprot', function(req, res){
  handleReq(uniprot, req, res);
});

/**
 * @swagger
 * /chebi:
 *   post:
 *     description: chebi search service
 *     tags:
 *       - grounding-search
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: q
 *         description: Search text
 *         in: formData
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Chebi get query results
 */
// e.g. POST /chebi { q: 'iron' }
router.post('/chebi', function(req, res){
  handleReq(chebi, req, res);
});

/**
 * @swagger
 * /ncbi:
 *   post:
 *     description: ncbi search service
 *     tags:
 *       - grounding-search
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: q
 *         description: Search text
 *         in: formData
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: NCBI get query results
 */
// e.g. POST /ncbi { q: 'iron' }
router.post('/ncbi', function(req, res){
  handleReq(ncbi, req, res);
});

/**
 * @swagger
 * /search:
 *   post:
 *     description: aggregate search service
 *     tags:
 *       - grounding-search
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: q
 *         description: Search text
 *         in: formData
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Aggregate get query results
 */
// e.g. POST /search { q: 'p53' }
router.post('/search', function(req, res){
  const { namespace } = req.body; // allow specifying namespace filter
  let datasource;

  if( namespace != null ){
    datasource = getDataSource(namespace);
  } else {
    datasource = aggregate;
  }

  handleReq(datasource, req, res);
});

// TODO swagger docs
router.post('/get', function(req, res){
  const { namespace, id } = req.body;

  aggregate.get(namespace, id).then(searchRes => res.json(searchRes));
});

export default router;
