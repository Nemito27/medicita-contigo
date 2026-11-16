import {defineConfig} from 'vite';
export default defineConfig({root:'web',envDir:import.meta.dirname,base:'./',build:{outDir:'../dist',emptyOutDir:true},server:{port:5173}});
