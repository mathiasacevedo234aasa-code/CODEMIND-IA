import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Prueba el analizador de los lenguajes que no son del navegador.
 *
 * No usa el modulo de la aplicacion tal cual porque alli las gramaticas se
 * piden por HTTP al navegador; aqui se cargan desde el disco. Lo que se prueba
 * es lo que de verdad importa y es facil de romper: que de cada lenguaje salgan
 * los elementos esperados, con su tipo y su linea real.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gramaticasDir = path.join(raiz, 'web', 'public', 'gramaticas');

if (!(await fs.access(gramaticasDir).then(() => true).catch(() => false))) {
  console.error('Faltan las gramaticas. Ejecuta "npm run gramaticas" antes.');
  process.exit(1);
}

const analizador = await import(
  pathToFileURL(path.join(raiz, 'web/src/lib/analyzer/treesitter.ts')).href
);
// Las gramaticas se leen del disco en lugar de pedirlas por HTTP: es lo unico
// que cambia respecto a como funciona dentro de la aplicacion.
analizador.usarGramaticasDesde(gramaticasDir.split(path.sep).join('/'));

const CASOS = [
  {
    ext: 'py',
    archivo: 'tienda.py',
    codigo: `import os
from decimal import Decimal

IVA = Decimal("0.19")

class Carrito:
    def __init__(self):
        self.items = []

    def total(self):
        return sum(i.precio for i in self.items)

def aplicar_iva(base):
    interno = base * 2
    return base * (1 + IVA)
`,
    espera: [
      ['IVA', 'constante', 4],
      ['Carrito', 'clase', 6],
      ['Carrito.__init__', 'metodo de clase', 7],
      ['Carrito.total', 'metodo de clase', 10],
      ['aplicar_iva', 'funcion', 13],
    ],
    imports: ['os', 'decimal'],
    noEspera: ['interno'],
  },
  {
    ext: 'java',
    archivo: 'Carrito.java',
    codigo: `package tienda;

import java.util.List;

public class Carrito {
    private List<Item> items;

    public Carrito() {
        this.items = new ArrayList<>();
    }

    public double total() {
        return 0.0;
    }
}

interface Pagable {
    void pagar();
}
`,
    espera: [
      ['Carrito', 'clase', 5],
      ['Carrito.Carrito', 'constructor de clase', 8],
      ['Carrito.total', 'metodo de clase', 12],
      ['Pagable', 'interfaz', 17],
    ],
    imports: ['java.util.List'],
  },
  {
    ext: 'cs',
    archivo: 'Carrito.cs',
    codigo: `using System;

namespace Tienda {
    public class Carrito {
        public int Total { get; set; }

        public Carrito() { }

        public decimal Calcular() => 0m;
    }

    public enum Estado { Abierto, Cerrado }
}
`,
    espera: [
      ['Carrito', 'clase', 4],
      ['Carrito.Total', 'propiedad', 5],
      ['Carrito.Calcular', 'metodo de clase', 9],
      ['Estado', 'enumeracion', 12],
    ],
    imports: ['System'],
  },
  {
    ext: 'go',
    archivo: 'carrito.go',
    codigo: `package tienda

import "fmt"

type Carrito struct {
	Items []Item
}

func NuevoCarrito() *Carrito {
	return &Carrito{}
}

func (c *Carrito) Total() float64 {
	return 0
}
`,
    espera: [
      ['Carrito', 'clase', 5],
      ['NuevoCarrito', 'funcion', 9],
      ['Total', 'metodo de clase', 13],
    ],
    imports: ['fmt'],
  },
  {
    ext: 'rs',
    archivo: 'carrito.rs',
    codigo: `use std::collections::HashMap;

pub struct Carrito {
    items: Vec<Item>,
}

impl Carrito {
    pub fn nuevo() -> Self {
        Carrito { items: vec![] }
    }

    pub fn total(&self) -> f64 {
        0.0
    }
}

pub trait Pagable {
    fn pagar(&self);
}
`,
    espera: [
      ['Carrito', 'clase', 3],
      ['Carrito.nuevo', 'metodo de clase', 8],
      ['Carrito.total', 'metodo de clase', 12],
      ['Pagable', 'interfaz', 17],
    ],
    imports: ['std'],
  },
  {
    ext: 'php',
    archivo: 'Carrito.php',
    codigo: `<?php
namespace Tienda;

class Carrito {
    public function total() {
        return 0;
    }
}

function ayuda() {
    return null;
}
`,
    espera: [
      ['Carrito', 'clase', 4],
      ['Carrito.total', 'metodo de clase', 5],
      ['ayuda', 'funcion', 10],
    ],
  },
  {
    ext: 'rb',
    archivo: 'carrito.rb',
    codigo: `class Carrito
  def initialize
    @items = []
  end

  def total
    0
  end
end

module Ayuda
  def self.formatear(v)
    v.to_s
  end
end
`,
    espera: [
      ['Carrito', 'clase', 1],
      ['Carrito.initialize', 'metodo de clase', 2],
      ['Carrito.total', 'metodo de clase', 6],
      ['Ayuda', 'modulo', 11],
    ],
  },
  {
    ext: 'sh',
    archivo: 'desplegar.sh',
    codigo: `#!/bin/bash
set -e

construir() {
  npm run build
}

construir
`,
    espera: [['construir', 'funcion', 4]],
  },
];

const NL = String.fromCharCode(10);

/** Los lenguajes anadidos en esta version, con un trozo real de cada uno. */
const NUEVOS = [
  { ext: 'scala', archivo: 'Carrito.scala', codigo: ["package tienda", "", "class Carrito(val id: String) {", "  def total(): Double = 0.0", "}", "", "object Util {", "  def ayuda() = 1", "}", "", "trait Pagable {", "  def pagar(): Unit", "}"].join(NL),
    espera: [['Carrito', 'clase'], ['Util', 'modulo'], ['Pagable', 'interfaz']] },
  { ext: 'ex', archivo: 'tienda.ex', codigo: ["defmodule Tienda do", "  def total(items) do", "    Enum.sum(items)", "  end", "", "  defp privada(x), do: x", "end"].join(NL),
    // En Elixir no hay metodos: son funciones dentro de un modulo.
    espera: [['Tienda', 'modulo'], ['Tienda.total', 'funcion']] },
  { ext: 'zig', archivo: 'main.zig', codigo: ["const std = @import(\"std\");", "", "pub fn main() !void {", "    std.debug.print(\"hola\", .{});", "}"].join(NL),
    espera: [['main', 'funcion']] },
  { ext: 'sol', archivo: 'Tienda.sol', codigo: ["pragma solidity ^0.8.0;", "", "contract Tienda {", "  uint public total;", "", "  function comprar(uint n) public returns (bool) {", "    return true;", "  }", "}"].join(NL),
    espera: [['Tienda', 'clase'], ['Tienda.comprar', 'metodo de clase']] },
  { ext: 'ml', archivo: 'tienda.ml', codigo: ["let iva = 0.19", "", "let total items = List.fold_left (+.) 0.0 items", "", "module Util = struct", "  let ayuda () = 1", "end"].join(NL),
    espera: [['total', 'funcion']] },
  { ext: 'm', archivo: 'Carrito.m', codigo: ["@interface Carrito : NSObject", "- (void)agregar:(NSString *)item;", "@end", "", "@implementation Carrito", "- (void)agregar:(NSString *)item { }", "@end"].join(NL),
    espera: [['Carrito', 'interfaz']] },
  { ext: 'json', archivo: 'package.json', codigo: ["{", "  \"name\": \"tienda\",", "  \"version\": \"1.0.0\",", "  \"scripts\": { \"dev\": \"vite\" }", "}"].join(NL),
    espera: [['name', 'propiedad'], ['version', 'propiedad']] },
  { ext: 'toml', archivo: 'Cargo.toml', codigo: ["[package]", "name = \"tienda\"", "version = \"1.0.0\"", "", "[dependencies]", "serde = \"1.0\""].join(NL),
    espera: [['package', 'seccion']] },
];
const fallos = [];

for (const caso of CASOS) {
  const res = await analizador.analizarConGramatica(caso.archivo, caso.codigo, caso.ext);
  console.log(`\n=== ${caso.archivo}`);
  if (!res) {
    fallos.push(`${caso.archivo}: no se obtuvo ningun analisis`);
    continue;
  }
  for (const s of res.simbolos) console.log(`  ${String(s.line).padStart(3)}  ${s.kind.padEnd(20)} ${s.qualifiedName}`);
  if (res.imports.length) console.log(`  importa: ${res.imports.join(', ')}`);

  for (const [nombre, kind, linea] of caso.espera) {
    const encontrado = res.simbolos.find((s) => s.qualifiedName === nombre);
    if (!encontrado) {
      fallos.push(`${caso.archivo}: no encontro "${nombre}"`);
      continue;
    }
    if (encontrado.kind !== kind) fallos.push(`${caso.archivo}: "${nombre}" salio como ${encontrado.kind} y deberia ser ${kind}`);
    if (encontrado.line !== linea) fallos.push(`${caso.archivo}: "${nombre}" en la linea ${encontrado.line} y deberia estar en la ${linea}`);
  }
  for (const nombre of caso.noEspera ?? []) {
    if (res.simbolos.some((s) => s.name === nombre)) {
      fallos.push(`${caso.archivo}: "${nombre}" no deberia aparecer (es una variable de dentro de una funcion)`);
    }
  }
  for (const esperado of caso.imports ?? []) {
    if (!res.imports.some((i) => i.includes(esperado))) {
      fallos.push(`${caso.archivo}: no detecto la importacion de "${esperado}"`);
    }
  }
}

console.log(NL + "=== Lenguajes anadidos");
for (const caso of NUEVOS) {
  const res = await analizador.analizarConGramatica(caso.archivo, caso.codigo, caso.ext);
  if (!res) {
    fallos.push(`${caso.archivo}: no se obtuvo analisis`);
    continue;
  }
  const resumen = res.simbolos.map((x) => `${x.qualifiedName}:${x.kind}`).join(', ');
  console.log(`  ${caso.archivo.padEnd(14)} ${resumen.slice(0, 95) || '(nada)'}`);
  for (const [nombre, kind] of caso.espera) {
    const hallado = res.simbolos.find((x) => x.qualifiedName === nombre);
    if (!hallado) fallos.push(`${caso.archivo}: no encontro "${nombre}"`);
    else if (hallado.kind !== kind) fallos.push(`${caso.archivo}: "${nombre}" salio como ${hallado.kind}, se esperaba ${kind}`);
  }
}

// Un formato de datos no puede desmenuzarse entero: solo lo de arriba.
const jsonHondo = await analizador.analizarConGramatica('hondo.json',
  JSON.stringify({ a: { b: { c: { d: { e: 1 } } } } }, null, 2), 'json');
if (jsonHondo.simbolos.some((x) => x.name === 'e')) {
  fallos.push('el analizador de JSON baja demasiado: solo debe mirar el primer nivel');
}

// Un lenguaje que no lleva gramatica debe devolver null, no fallar.
const ajeno = await analizador.analizarConGramatica('notas.txt', 'hola', 'txt');
if (ajeno !== null) fallos.push('un lenguaje sin gramatica deberia devolver null');


console.log('\n=== Comprobaciones');
if (fallos.length) {
  for (const f of fallos) console.log('  FALLO:', f);
  process.exit(1);
}
console.log(`  Todo correcto: ${CASOS.length + NUEVOS.length} lenguajes, con su tipo y su linea real.`);
