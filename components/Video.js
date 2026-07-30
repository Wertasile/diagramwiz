import React from 'react'
import { Canvas } from 'fabric'

const Video = (canvas: Canvas) => {

    // url of user video
    const [videoSrc, setVideoSrc] = useState('')

    // fabric video object - video element wrapped as fabric object
    const [fabricVideo, setFabricVideo] = useState(null)

    // recording chunks - media recorder chunks to be sent in array to be export as video
    const [recordingChunks, setRecordingChunks] = useState([])

    // recording state - true if recording, false if not recording
    const [isRecording, setIsRecording] = useState(false)

    // load percentage
    const [loadPercentage, setLoadPercentage] = useState(0);

    // video upload state
    const [uploadMessage, setUploadMessage] = useState('')

    // recording duration
    const [recordingDuration, setRecordingDuration] = useState(0)

    // play state - true if playing, false if not playing
    const [isPlaying, setIsPlaying] = useState(false)
    
    // func when user select video file
    const handleVideoSelect = (event) => {
        const file = event.target.files[0]
        if (file) {
            setVideoSrc(URL.createObjectURL(file))
            setLoadPercentage(0)
            setUploadMessage('')
            setRecordingChunks([])
            setRecordingDuration(0)
            setIsRecording(false)
            setIsPlaying(false)

            const videoElement = document.createElement('video')
            videoElement.src = URL.createObjectURL(file)
            videoElement.crossOrigin = 'anonymous'

            videoElement.addEventListener('loadeddata', () => {
                setLoadPercentage(100)
            })
            videoElement.addEventListener('error', (error) => {
                console.error('Error loading video:', error)
            })

            // calculate video width and height, t
            const videoWidth = videoElement.videoWidth
            const videoHeight = videoElement.videoHeight
            const aspectRatio = videoWidth / videoHeight

            const canvasWidth = canvas.width
            const canvasHeight = canvas.height

            
            
            
        }
    }

    // start recording
    const startRecording = () => {
        setIsRecording(true)
    }

    // stop recording
    const stopRecording = () => {
        setIsRecording(false)
    }

  return (
    <div>Video</div>
  )
}

export default Video