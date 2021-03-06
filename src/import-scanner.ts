import { NodeUpload } from './node-upload';
import * as FS from 'fs';
import * as vscode from 'vscode';
import * as _ from 'lodash';

import { ImportDb } from './import-db';
import { AutoImport } from './auto-import';

export class ImportScanner {

    private scanStarted: Date;

    private scanEnded: Date;

    private showOutput: boolean;

    private filesToScan: string;

    private showNotifications: boolean;

    private imageExtensions: Array<string> = ['png', 'jpg', 'jpeg', 'svg'];

    constructor(private config: vscode.WorkspaceConfiguration) {
        this.filesToScan = this.config.get<string>('filesToScan');
        if (this.config.get<boolean>('images')) {
            this.filesToScan = [this.filesToScan.split('}')[0], this.imageExtensions.join(',')].join(',') + '}';
        }
        this.showNotifications = this.config.get<boolean>('showNotifications');
    }

    public scan(request: any): void {

        this.showOutput = request.showOutput ? request.showOutput : false;

        if (this.showOutput) {
            this.scanStarted = new Date();
        }

        let scanLocation: any = this.filesToScan;

        if (request.workspace !== undefined) {
            scanLocation = new vscode.RelativePattern(request.workspace, scanLocation);
        }

        vscode.workspace
            .findFiles(scanLocation, '**/node_modules/**', 99999)
            .then((files) => this.processWorkspaceFiles(files));

        vscode.commands
            .executeCommand('extension.scanNodeModules');

    }

    public edit(request: any): void {
        ImportDb.delete(request);
        this.loadFile(request.file, request.workspace, true);
        new NodeUpload(vscode.workspace.getConfiguration('svelte-autoimport')).scanNodeModules();

    }

    public delete(request: any): void {
        ImportDb.delete(request);
        AutoImport.setStatusBar();
    }


    private processWorkspaceFiles(files: vscode.Uri[]): void {

        let pruned = files.filter((f) => {
            return f.fsPath.indexOf('typings') === -1 &&
                f.fsPath.indexOf('node_modules') === -1 &&
                f.fsPath.indexOf('jspm_packages') === -1;
        });

        pruned.forEach((f, i) => {

            let workspace: vscode.WorkspaceFolder
                = vscode.workspace.getWorkspaceFolder(f)

            this.loadFile(f, workspace, i === (pruned.length - 1));


        });
    }

    private loadFile(file: vscode.Uri, workspace: vscode.WorkspaceFolder, last: boolean): void {

        FS.readFile(file.fsPath, 'utf8', (err, data) => {

            if (err) {
                return console.log(err);
            }

            this.processFile(data, file, workspace);

            if (last) {
                AutoImport.setStatusBar();
            }

            if (last && this.showOutput && this.showNotifications) {
                this.scanEnded = new Date();

                let str = `[AutoImport] cache creation complete - (${Math.abs(<any>this.scanStarted - <any>this.scanEnded)}ms)`;

                vscode.window
                    .showInformationMessage(str);
            }

        });
    }

    private async processFile(data: any, file: vscode.Uri, workspace: vscode.WorkspaceFolder): Promise<any> {

        var classMatches = data.match(/(export class) ([a-zA-z])\w+/g),
            interfaceMatches = data.match(/(export interface) ([a-zA-z])\w+/g),
            propertyMatches = data.match(/(export let) ([a-zA-z])\w+/g),
            varMatches = data.match(/(export var) ([a-zA-z])\w+/g),
            constMatches = data.match(/(export const) ([a-zA-z])\w+/g),
            enumMatches = data.match(/(export enum) ([a-zA-z])\w+/g),
            typeMatches = data.match(/(export type) ([a-zA-z])\w+/g),
            defaultMatches = data.match(/(export default) ([a-zA-z])\w+/g),
            svelteMatches = file.path.split('.').pop() === 'svelte',
            imageMatches = this.imageExtensions.indexOf(file.path.split('.').pop()) !== -1;

        if (svelteMatches || imageMatches) {
            let workingFile: string = file.path.split('/').pop().split('.').shift(); 
            ImportDb.saveImport(this.toPascalCase(workingFile), data, file, workspace, true);
            return;
        }

        if (defaultMatches) {
            defaultMatches.forEach(m => {
                let workingFile: string = m.replace('default').replace('export');
                ImportDb.saveImport(workingFile, data, file, workspace, true);
            })
        }
        
        if (classMatches) {
            classMatches.forEach(m => {
                let workingFile: string =
                    m.replace('export', '').replace('class', '');

                ImportDb.saveImport(workingFile, data, file, workspace);
            });
        }

        if (interfaceMatches) {
            interfaceMatches.forEach(m => {
                let workingFile: string =
                    m.replace('export', '').replace('interface', '');

                ImportDb.saveImport(workingFile, data, file, workspace);
            });
        }

        if (propertyMatches || varMatches || constMatches || enumMatches || typeMatches) {

            [].concat(propertyMatches, varMatches, constMatches, enumMatches, typeMatches).filter(m => m).forEach(m => {
                let workingFile: string =
                    m.replace('export', '').replace('let', '').replace('var', '').replace('const', '').replace('enum', '').replace('type', '');

                ImportDb.saveImport(workingFile, data, file, workspace);
            });
        }
    }

    private toPascalCase(string: string): string {
        string = string.charAt(0).toUpperCase() + string.slice(1)
        return string.replace(/[-_]([a-z])/g, (g: string) => g[1].toUpperCase())
    }
}