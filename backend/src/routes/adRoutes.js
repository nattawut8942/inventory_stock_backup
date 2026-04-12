import express from 'express';
import {
    testConnection,
    getUsers,
    getComputers,
    getGroups,
    getOUStructure,
    getOUMembers,
} from '../controllers/adController.js';

const router = express.Router();

router.get('/ad/test',         testConnection);
router.get('/ad/users',        getUsers);
router.get('/ad/computers',    getComputers);
router.get('/ad/groups',       getGroups);
router.get('/ad/ou-structure', getOUStructure);
router.get('/ad/ou-members',   getOUMembers);   // ?dn=OU=...&scope=one|sub

export default router;