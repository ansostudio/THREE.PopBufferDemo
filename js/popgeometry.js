class PopGeometry {
    init( modelJson ) {
        this.modelJson = modelJson;
        this.totalNumVertices = this.modelJson.numVertices;
        this.currentLevel = 0;
        this.monochrome = false;
        // 12 bytes per vertex -> 6 bytes for positions, 2 bytes for normals, 4 bytes for colors.
        // 2 bytes per array element -> We need 12 / 2 = 6 array elements to describe a single vertex.
        this.interleavedArray = new Uint16Array( 6 * this.totalNumVertices );
        this.interleavedBuffer = new THREE.InterleavedBuffer( this.interleavedArray, 6 );
        this.interleavedBuffer.itemSize = 6;
        this.interleavedBuffer.numItems = this.totalNumVertices;
        this.popGeomBuffer = new THREE.BufferGeometry();
        this.popGeomBuffer.addAttribute( 'position', new THREE.InterleavedBufferAttribute( this.interleavedBuffer, 3, 0, false, this.context.UNSIGNED_SHORT, 2 ) );
        this.popGeomBuffer.addAttribute( 'aVertexNormal', new THREE.InterleavedBufferAttribute( this.interleavedBuffer, 2, 6, false, this.context.UNSIGNED_BYTE, 1 ) );
        this.popGeomBuffer.addAttribute( 'aVertexColor', new THREE.InterleavedBufferAttribute( this.interleavedBuffer, 4, 8, false, this.context.UNSIGNED_BYTE, 1 ) );

        var pop_vs =
            "precision mediump float;\n"+
            "#if NUM_DIR_LIGHTS > 0\n"+
            "struct DirectionalLight {\n"+
            "vec3 direction;\n"+
            "vec3 color;\n"+
            "};\n"+
            "uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];\n"+
            "#endif\n"+
            "uniform vec3 ambientLightColor;\n"+
            "attribute vec2 aVertexNormal;\n"+
            "attribute vec4 aVertexColor;\n"+
            "uniform int uClusterFactor;\n"+
            "uniform vec3 uMinValues;\n"+
            "uniform vec3 uMaxValues;\n"+
            "varying vec4 vColor;\n"+
            "varying vec3 vLighting;\n"+
            "vec3 decodeNormal(float u, float v) {\n"+
                "vec3 nor = vec3(u, v, 0.);\n"+
                "// Transform normal values from range [0, UCHAR_MAX] to range [-1, 1]\n"+
                "nor.xy = nor.xy / 127. - 1.;\n"+
                "// Invert octahedron calulation\n"+
                "nor.z = 1.0 - abs(nor.x) - abs(nor.y);\n"+
                "nor.xy = nor.z >= 0.0 ? nor.xy : (1.0 - abs(nor.yx)) * sign(nor.xy);\n"+
                "return normalize(nor);\n"+
            "}\n"+
            "void main() {\n"+
                "vec3 addedDiffuse = vec3(0.0, 0.0, 0.0);\n"+
                "vColor = aVertexColor / 255.0;\n"+
                "// Transform coordinates back to original coordinates\n"+
                "vec3 transformedPosition = floor(position / vec3(uClusterFactor)) * vec3(uClusterFactor) / vec3(65535 - uClusterFactor) * (uMaxValues - uMinValues) + uMinValues;\n"+
                "gl_Position = projectionMatrix * modelViewMatrix * vec4(transformedPosition, 1.0);\n"+
                "// Decode and transform normal\n"+
                "vec3 normal =  normalMatrix * normalize(decodeNormal(aVertexNormal.x, aVertexNormal.y));\n"+
                "#if NUM_DIR_LIGHTS > 0\n"+
                "for( int l = 0; l < NUM_DIR_LIGHTS; ++l ){\n"+
                    "//Calculate Diffuse component\n"+
                    "float diffuse = max(dot(normal, directionalLights[0].direction), 0.0);\n"+
                    "addedDiffuse += directionalLights[l].color * diffuse;\n"+ 
                "}\n"+
                "#endif\n"+
                "vLighting = addedDiffuse + ambientLightColor;\n"+
            "}\n";

        var pop_fs =
            "precision mediump float;\n"+
            "varying vec4 vColor;\n"+
            "varying vec3 vLighting;\n"+
            "uniform float uFogDensity;\n"+
            "uniform vec3 uFogColor;\n"+
            "uniform bool uFog;\n"+
            "uniform bool uMonochrome;\n"+
            "uniform float uAlpha;\n"+
            "void main() {\n"+
                "float depth = gl_FragCoord.z / gl_FragCoord.w;\n"+
                "const float LOG2 = 1.442695;\n"+
                "float fogFactor = 1.0;\n"+
                "if( uFog ) {\n"+
                    "fogFactor = exp2(- uFogDensity * uFogDensity * depth * depth * LOG2);\n"+
                    "fogFactor = 1.0 - clamp(fogFactor, 0.0, 1.0);\n"+
                "}\n"+
                "if(!uMonochrome) gl_FragColor = vec4(vLighting * vColor.rgb, vColor.a * uAlpha);\n"+
                "else gl_FragColor = vec4(vec3(vLighting * (vColor.r + vColor.g + vColor.b)) / 3.0, vColor.a * uAlpha);\n"+
                "if(uFog) gl_FragColor = mix(gl_FragColor, vec4(uFogColor, gl_FragColor.w), fogFactor);\n"+
            "}\n";
        var uniforms = THREE.UniformsUtils.merge([
            THREE.UniformsLib['lights'],
            {
                "uMinValues" : { type:"v3", value: new THREE.Vector3( this.modelJson.xmin, this.modelJson.ymin, this.modelJson.zmin ) },
                "uMaxValues" : { type:"v3", value: new THREE.Vector3( this.modelJson.xmax, this.modelJson.ymax, this.modelJson.zmax ) },
                "uClusterFactor" : { type: "i", value: this.clusteringFactor },
                "uPMatrix" : { type: "mat4", value: this.pMatrix },
                "uMVMatrix": { type: "mat4", value: this.mvMatrix },
                "uFogDensity": { value: 0.004 },
                "uFogColor":   { value: new THREE.Vector3( .1, .1, .1 ) },
                "uFog": { type: "bool", value: true },
                "uMonochrome": { type: "bool", value: this.monochrome },
                "uAlpha": { type: "f", value: 1.0 },
            }
        ]);
        var popGeomMaterial = new THREE.ShaderMaterial({
            vertexShader: pop_vs,
            fragmentShader: pop_fs,
            uniforms: uniforms,
            lights: true,
        });

        popGeomMaterial.side = THREE.DoubleSide;
        this.popGeometry = new THREE.Mesh( this.popGeomBuffer, popGeomMaterial );
        this.popGeometry.matrixAutoUpdate = false;
        this.popGeometry.updateMatrix();
    }

    setLevel( level ) {
        if( ! this.popGeometry ) return;
        this.currentLevel = level;
        this.levelVertexCount = this.modelJson.levels[level];
        console.log( this.levelVertexCount );
        if( this.currentLevel !== 0 ) {
            this.popGeomBuffer.setDrawRange( 0, this.levelVertexCount );
            this.popGeometry.visible = true;
        }
        else this.popGeometry.visible = false;
        this.clusteringFactor = Math.pow(2, 16-this.currentLevel);
        this.popGeometry.material.uniforms.uClusterFactor.value = this.clusteringFactor;
        if( this.triggerRender )
            this.triggerRender();
    }   

    getLevel() {
        return this.currentLevel;
    }

    getMaxLevel() {
        return this.modelJson.levels.length;
    }

    getGeometry() {
        return this.popGeometry;
    }

    constructor( context, render = null ) {
        this.context = context;
        this.triggerRender = render;
    }

    updateData( interleavedData, level ) {
        interleavedData = new Uint16Array(interleavedData);

        var offset;
        var levelsize;
        if( this.modelJson.levelCount != this.currentLevel ) {
            offset = (level == 0) ? 0 : this.modelJson.levels[level - 1];
            levelsize = (level == 0) ? this.modelJson.levels[0] : ( this.modelJson.levels[level] - this.modelJson.levels[level-1] );
        }
        else {
            offset = 0;
            levelsize = this.modelJson.levels[ this.modelJson.levelCount - 1 ];
            level = this.modelJson.levelCount - 1;
        }
        // Append data to buffer...
        this.interleavedArray.set(
            // Make sure the buffer only contains the data for this level
            interleavedData.subarray(0, levelsize * this.interleavedBuffer.itemSize),
            // Insert after the current data
            offset * this.interleavedBuffer.itemSize
        );

        this.interleavedBuffer.setArray( this.interleavedArray );
        this.interleavedBuffer.needsUpdate = true;

        this.setLevel( level );

        if( this.triggerRender )
            this.triggerRender();
    };

    enableMonochrome( enable = true ) {
        if( ! this.popGeometry || ! this.popGeometry.material ) return;
        this.monochrome = enable;
        this.popGeometry.material.uniforms.uMonochrome.value = this.monochrome;
        if( this.triggerRender )
            this.triggerRender();
    }

    toggleMonochrome() {
        if( ! this.popGeometry || ! this.popGeometry.material ) return;
        this.enableMonochrome( ! this.monochrome );
    }

    setAlpha( alpha ) {
        if( ! this.popGeometry || ! this.popGeometry.material ) return;
        this.popGeometry.material.uniforms.uAlpha.value = alpha;
    }

    enableFog( enable = true ) {
        if( ! this.popGeometry || ! this.popGeometry.material ) return;
        this.popGeometry.material.uniforms.uFog.value = enable;
    }

    setFogDensity( density ) {
        if( ! this.popGeometry || ! this.popGeometry.material ) return;
        this.popGeometry.material.uniforms.uFogDensity.value = density;
    }

    setFogColor( color ) {
        if( ! this.popGeometry || ! this.popGeometry.material ) return;
        this.popGeometry.material.uniforms.uFogColor.value = color;
    }
}


